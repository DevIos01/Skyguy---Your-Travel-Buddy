import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * travel-chat
 *  - Authenticated edge function
 *  - Loads the full conversation history for the given conversation_id
 *  - Calls Mistral with the history + Skyscanner tools (tool calling)
 *  - Executes tool calls by invoking sibling edge functions
 *  - Persists user message, assistant tool-calls, tool responses, and the final assistant reply
 *  - Returns the final assistant message (with optional structured `results`)
 */

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
// Mistral Medium 3 is their current flagship-class text model — matches or
// beats `mistral-large-latest` on reasoning + tool-calling benchmarks while
// being noticeably faster and cheaper. Best fit for this multi-tool chat loop.
const MISTRAL_MODEL = "mistral-medium-latest";

const tools = [
  {
    type: "function",
    function: {
      name: "search_places",
      description:
        "Resolve a city or airport into a Skyscanner entityId / iataCode. Call this BEFORE search_flights. Results are pre-filtered to ONLY PLACE_TYPE_CITY and PLACE_TYPE_AIRPORT (the only types Skyscanner Flights accepts — countries/regions are dropped). The FIRST entry is already the best match. ALWAYS prefer the city entityId (PLACE_TYPE_CITY) over a single airport unless the user explicitly named an airport (e.g. 'JFK', 'Heathrow'). Verify the chosen candidate's `name` actually matches what the user typed — if it doesn't (e.g. user said 'Hamburg' but top result is 'Ilorin'), pick a later candidate or ask the user to clarify. NEVER pass an entityId whose name doesn't match the user's city. If search_flights ever returns error=INVALID_ENTITY_ID, call search_places again and pick a different CITY/AIRPORT entityId — do NOT give up.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "City, airport, or region name to look up" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_flights",
      description:
        "Search live flight prices. Requires Skyscanner entityIds for origin and destination (use search_places first if you only have city names).",
      parameters: {
        type: "object",
        properties: {
          originEntityId: { type: "string" },
          destinationEntityId: { type: "string" },
          departureDate: {
            type: "object",
            properties: {
              year: { type: "number" },
              month: { type: "number" },
              day: { type: "number" },
            },
            required: ["year", "month", "day"],
          },
          returnDate: {
            type: "object",
            properties: {
              year: { type: "number" },
              month: { type: "number" },
              day: { type: "number" },
            },
          },
          adults: { type: "number", default: 1 },
          childrenAges: {
            type: "array",
            items: { type: "number" },
            description: "Optional list of child ages (0-17). Pass one entry per child travelling.",
          },
          cabinClass: {
            type: "string",
            enum: ["CABIN_CLASS_ECONOMY", "CABIN_CLASS_PREMIUM_ECONOMY", "CABIN_CLASS_BUSINESS", "CABIN_CLASS_FIRST"],
          },
          currency: { type: "string", default: "EUR" },
          directOnly: {
            type: "boolean",
            description: "If true, only return non-stop itineraries (0 stops on every leg). Use this when the user said 'direct only' or has direct_flights_only: true in preferences.",
          },
          maxStops: {
            type: "number",
            description: "Maximum number of stops per leg (0 = direct, 1 = up to one connection, 2 = up to two). If both directOnly and maxStops are passed, directOnly wins.",
          },
        },
        required: ["originEntityId", "destinationEntityId", "departureDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hotels",
      description: "Search Wanderlush Stays (mock hotel inventory) for a city/area and date range. Use this for any hotel question. NO entityId needed — just pass the human city name like 'Tokyo' or 'Paris'.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name (e.g. 'Tokyo', 'Paris', 'New York')." },
          area: { type: "string", description: "Optional neighborhood/area filter (e.g. 'Shinjuku', 'Marais')." },
          checkInDate: { type: "string", description: "YYYY-MM-DD" },
          checkOutDate: { type: "string", description: "YYYY-MM-DD" },
          adults: { type: "number", default: 2 },
          rooms: { type: "number", default: 1 },
          minStars: { type: "number", description: "Optional min star rating 1-5." },
          minRating: { type: "number", description: "Optional min guest rating 0-5." },
          currency: { type: "string", default: "EUR" },
        },
        required: ["city", "checkInDate", "checkOutDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_cars",
      description: "Search Wanderlush Wheels (mock rental car inventory) for a pickup city and date range.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Pickup city (e.g. 'Tokyo')." },
          pickupDate: { type: "string", description: "YYYY-MM-DD" },
          returnDate: { type: "string", description: "YYYY-MM-DD" },
          vehicleClass: { type: "string", description: "Optional: economy, compact, intermediate, suv, luxury, minivan, fullsize-suv, kei" },
          transmission: { type: "string", enum: ["automatic", "manual"] },
          minSeats: { type: "number" },
          minSupplierRating: { type: "number", description: "0-5" },
          currency: { type: "string", default: "EUR" },
        },
        required: ["city", "pickupDate", "returnDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_favorite_hotels",
      description:
        "List the hotels the current user has saved as favorites. Use this to bias hotel suggestions or recall previous picks. Takes no arguments.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_favorite_hotel",
      description:
        "Save a Wanderlush hotel to the user's favorites. Use the hotel.id from a previous search_hotels result.",
      parameters: {
        type: "object",
        properties: {
          hotelId: { type: "string", description: "UUID of the hotel from search_hotels." },
          note: { type: "string", description: "Optional short personal note." },
        },
        required: ["hotelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_favorite_hotel",
      description: "Remove a hotel from the user's favorites by its UUID.",
      parameters: {
        type: "object",
        properties: { hotelId: { type: "string" } },
        required: ["hotelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Render an INTERACTIVE question card in the chat instead of asking the user in plain prose. Use this whenever you need details from the user before searching (dates, party size, cabin class, yes/no confirmation like 'use saved home address?', etc). Group all related questions in ONE call — never chain multiple ask_user calls. Each field becomes a form input. The user's answers come back as the next user message; you then continue with the search. Do NOT call ask_user for information you can already infer or that the user just provided.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Short friendly intro shown above the form (e.g. 'Quick check before I search:').",
          },
          submitLabel: {
            type: "string",
            description: "Optional button label, defaults to 'Continue'.",
          },
          questions: {
            type: "array",
            description: "1-5 form fields. Pick the most intuitive input type per question.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Short snake_case id, e.g. 'use_home_address'." },
                label: { type: "string", description: "The question text shown to the user." },
                hint: { type: "string", description: "Optional helper text below the label." },
                type: {
                  type: "string",
                  enum: ["boolean", "single", "multi", "text", "number", "date"],
                  description:
                    "boolean = yes/no toggle. single = pick one (radio). multi = pick many (checkboxes). text = short text input. number = numeric stepper input (use for counts like adults/rooms/children). date = calendar date picker (use this for ANY date question — departure, check-in, DOB, etc).",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Required for single/multi. 2-6 short options.",
                },
                placeholder: { type: "string", description: "Optional placeholder for text type." },
                format: {
                  type: "string",
                  enum: ["email", "number", "tel"],
                  description: "Optional. Validates text inputs as email / number / phone.",
                },
                minLength: { type: "number", description: "Optional min character length for text." },
                maxLength: { type: "number", description: "Optional max character length for text." },
                min: { type: "number", description: "Optional inclusive minimum for number/numeric-text inputs." },
                max: { type: "number", description: "Optional inclusive maximum for number/numeric-text inputs." },
                step: { type: "number", description: "Optional step for number inputs. Defaults to 1." },
                default: { description: "Optional default value (boolean/string/number)." },
                minDate: { type: "string", description: "Optional YYYY-MM-DD earliest selectable date." },
                maxDate: { type: "string", description: "Optional YYYY-MM-DD latest selectable date." },
                required: { type: "boolean", description: "Defaults to true." },
                showIf: {
                  type: "object",
                  description:
                    "Optional conditional visibility. The field is hidden unless another field's current value equals the given value. Use this to chain follow-ups, e.g. show 'alternate_origin' only when 'use_home_address' is false.",
                  properties: {
                    id: { type: "string", description: "id of the controlling field (must appear earlier in the questions array)." },
                    equals: { description: "Value the controlling field must equal for this field to appear (boolean / string / number)." },
                  },
                  required: ["id", "equals"],
                },
              },
              required: ["id", "label", "type"],
            },
          },
        },
        required: ["prompt", "questions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_preferences",
      description:
        "Read the user's travel preferences (cabin class, direct-only, min stars, default party size, etc). Use this BEFORE asking the user for missing search details — silently fill in their stored defaults instead. No arguments.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_user_preferences",
      description:
        "Persist updated travel preferences. Only include fields the user actually wants to change — others stay untouched.",
      parameters: {
        type: "object",
        properties: {
          preferred_cabin_class: { type: "string", enum: ["economy", "premium-economy", "business", "first"] },
          direct_flights_only: { type: "boolean" },
          max_stops: { type: "number" },
          baggage_preference: {
            type: "string",
            enum: ["none", "personal", "carry_on", "checked"],
            description:
              "What the user usually brings on a flight. none = no bag, personal = under-seat backpack (~40×20×25cm), carry_on = cabin bag (~55×40×20cm), checked = hold luggage (158cm linear, ~23kg).",
          },
          checked_bags: { type: "number", description: "Number of checked bags (0–3)." },
          max_carry_on_weight_kg: {
            type: "number",
            description: "Preferred carry-on weight limit in kg (typical: 7, 8, 10, 12).",
          },
          prefer_no_long_layovers: {
            type: "boolean",
            description: "If true, skip itineraries with layovers longer than ~4 hours.",
          },
          preferred_airlines: { type: "array", items: { type: "string" } },
          avoided_airlines: { type: "array", items: { type: "string" } },
          min_hotel_stars: { type: "number" },
          min_hotel_rating: { type: "number" },
          preferred_hotel_amenities: { type: "array", items: { type: "string" } },
          preferred_hotel_brands: { type: "array", items: { type: "string" } },
          preferred_car_transmission: { type: "string", enum: ["automatic", "manual"] },
          preferred_car_class: { type: "string" },
          min_car_seats: { type: "number" },
          default_adults: { type: "number" },
          default_children: { type: "number" },
          default_rooms: { type: "number" },
          preferred_currency: { type: "string" },
          home_city: { type: "string" },
          budget_level: { type: "string", enum: ["budget", "mid", "luxury"] },
          notes: { type: "string" },
        },
      },
    },
  },
];

const BASE_SYSTEM_PROMPT = `You are Skyguy, a friendly AI travel assistant.
- Flights are powered by LIVE Skyscanner data (search_places + search_flights).
- Hotels are powered by Wanderlush Stays™ (search_hotels) — a mock catalog. Pass the city name directly, no entityId.
- Rental cars are powered by Wanderlush Wheels™ (search_cars) — also a mock catalog.
You may cheerfully reference the Wanderlush brand (e.g. "Wanderlush Stays found 5 hotels…"). Treat its data as authoritative for the demo.

CRITICAL RULES — never break these:
- NEVER invent prices, names, ratings, or any travel data. Only reference what tool calls returned in this conversation.
- If a tool returns zero results (offerCount: 0 or hotelCount: 0), tell the user clearly that no live results were found, and suggest tweaking the dates, routes, cabin class, or destination. Do NOT make up alternatives.
- For FLIGHTS only: if you don't have an entityId for a city, call search_places first.

Asking for trip details (be polite, not interrogative):

GENERAL RULE — DO NOT OVER-ASK:
- BEFORE any ask_user call, you MUST call get_user_preferences once per conversation. Treat saved preferences (default_adults, default_children, default_rooms, preferred_cabin_class, preferred_car_transmission, min_hotel_stars, min_hotel_rating, min_car_seats, baggage_preference, direct_flights_only, max_stops, etc.) as authoritative defaults. NEVER ask the user about a field that's already covered by their preferences OR that they've already mentioned in this conversation OR that's obvious from context (e.g. "weekend trip for 2" → adults=2). Use the answer card to confirm only what is genuinely unknown.
- For ANY ask_user call, every field MUST have a sensible "default" set so the user can just hit Continue if defaults are right. Pull defaults from: (1) user preferences, (2) earlier conversation context, (3) reasonable assumptions (e.g. 1 room per 2 adults, ~14 days from today for departure).
- Group ALL missing questions for a category into ONE ask_user call. Never drip-feed. Never call ask_user twice in a row.

FLIGHTS — ask card MUST cover (one ask_user call, fields in this order, all with defaults):
  1. departure_date (date, default = ~14 days out, minDate = today)
  2. return_date (date, default = departure + 7, minDate = departure_date) — skip only if user clearly said "one-way"
  3. adults (number, min 1, max 9, default = default_adults or 1)
  4. children (number, min 0, max 8, default = default_children or 0)
  5. cabin_class (single, options ["Economy","Premium economy","Business","First"], default from preferred_cabin_class or "Economy")
  6. stops (single, options ["Direct only","Up to 1 stop","Up to 2 stops","Any"], default from direct_flights_only / max_stops, otherwise "Up to 1 stop"). Translate at call time: "Direct only"→directOnly:true; "Up to 1 stop"→maxStops:1; "Up to 2 stops"→maxStops:2; "Any"→omit both. NEVER skip stop filtering.
  7. baggage (single, options ["Nothing","Backpack (under seat)","Cabin bag (overhead bin)","Checked bag"], default from baggage_preference or "Cabin bag (overhead bin)") — always include this on routes where budget carriers compete, and respect it silently when set.
If origin or destination is missing, also include the appropriate text/use_home_address fields per the profile guidance. SKIP any field above whose value the user already gave in this thread or that is locked by saved preferences (still pre-fill the default — just don't pile on extra questions when context already answers them).

HOTELS — ask card MUST cover (one ask_user call, all with defaults):
  1. destination (text) — only if not already known
  2. check_in (date, default = ~14 days out, minDate = today)
  3. check_out (date, default = check_in + 3, minDate = check_in)
  4. adults (number, default = default_adults or 2, min 1, max 9)
  5. children (number, default = default_children or 0, min 0, max 8)
  6. rooms (number, default = default_rooms or ceil(adults/2), min 1, max 5)
  7. min_stars (single, options ["Any","3+","4+","5"], default from min_hotel_stars or "Any") — translate at call time to numeric minStars
  8. min_rating (single, options ["Any","7+","8+","9+"], default from min_hotel_rating or "Any") — translate to minRating numeric
Skip fields the user already answered or that preferences lock down.

CARS — ask card MUST cover (one ask_user call, all with defaults):
  1. pickup_city (text) — only if not already known
  2. pickup_date (date, default = ~14 days out, minDate = today)
  3. return_date (date, default = pickup + 3, minDate = pickup_date)
  4. transmission (single, options ["Automatic","Manual","Either"], default from preferred_car_transmission or "Automatic")
  5. vehicle_class (single, options ["Any","Economy","Compact","Intermediate","SUV","Luxury","Minivan"], default from preferred_car_class or "Any") — translate to vehicleClass arg, omit when "Any"
  6. min_seats (number, min 2, max 9, default from min_car_seats or 4)
Skip fields the user already answered.

CONTEXT-AWARE SKIPPING (critical):
- If the user's request already answered a field ("flight to Tokyo May 8 for 2"), DO NOT re-ask date/destination/adults — pre-fill them and only ask the rest.
- If saved preferences answer a field, DO NOT ask. Just use the value silently.
- If after applying preferences + context EVERY field is known, do NOT call ask_user at all — go straight to the search tool(s).
- If the user has set notes/preferences (e.g. direct flights only, min 4-star), respect them silently and mention them once like "Using your saved preference for direct flights."
- Encourage the user to fine-tune via the Settings page if they keep correcting you.

Asking via the interactive question card:
- WHENEVER you would otherwise ask the user a question in prose ("What dates?", "How many travelers?", "Want me to use your saved home address?"), call the ask_user tool instead so the UI renders proper inputs (toggles, radios, checkboxes, text fields).
- Bundle ALL related questions into ONE ask_user call. Never call ask_user twice in a row.
- Use type:"boolean" for yes/no, type:"single" with options for one-of-many (cabin class, transmission), type:"multi" for amenities/airlines, type:"date" for ANY date (departure, return, check-in/out, DOB), type:"number" for counts (adults, children, rooms, nights — set min/max and a sensible default), type:"text" only for free-form strings like city names. For text fields, set "format":"email"|"tel" and minLength/maxLength where it helps validation. For date fields, set "minDate" (e.g. today) and "maxDate" to constrain the calendar.
- Conditional follow-ups: when a question only matters depending on another answer (e.g. "where from?" only matters if "use home address?" = false), put both fields in the SAME ask_user call and use "showIf":{id:"<other_field_id>", equals:<value>} on the dependent field. Always set a sensible "default" on dependent text fields (e.g. the saved home city) so the user has a starting point.
- Keep your accompanying message text very short ("Quick check —") since the form below it carries the questions.
- After ask_user, STOP and wait for the user's reply. Their answers come back as a normal user message which you then act on.
- Do NOT use ask_user for confirmations after a search succeeded, or for things you already know.

Favorites:
- When a user says "save", "favorite", "I love this one" about a hotel from a recent result, call add_favorite_hotel with that hotel's id.
- When suggesting hotels, call list_favorite_hotels first if the user references "my favorites" / "the ones I saved" / wants similar to past picks.

Guidelines:
- Remember earlier messages and previously fetched results in this conversation.
- If a date is missing AND no default is implied by preferences/context, pick ~14 days from today and clearly say it's an assumption.
- Be concise. Briefly summarise the cheapest / fastest / best options; the UI renders the full cards.
- Combo requests: when the user asks for more than one travel category at once (e.g. "flights AND a car", "hotel + flight"), call ALL the relevant search tools in the SAME turn (in parallel tool_calls) so the UI can render a combined trip-bundle card with a total price. Don't search them across separate turns.
- PARTY-SIZE CONSISTENCY (critical for bundles): the trip's party size (adults + children) is a SINGLE shared fact for the whole bundle, not a per-tool choice. Whatever value you use for one component MUST be used for every other component in the same bundle. Concretely:
  - The same \`adults\` count must be passed to BOTH \`search_flights\` AND \`search_hotels\` in a bundle. Never search a flight for 1 adult and a hotel for 2 (or vice versa).
  - Resolve the party size ONCE per conversation, in this priority: (1) what the user explicitly stated in this thread ("for 2 people", "me and my partner", "family of 4"), (2) prior answers earlier in the same conversation, (3) saved \`default_adults\` / \`default_children\` from get_user_preferences, (4) sensible default of 2 adults for couples-style trips and 1 for solo phrasing.
  - If you previously searched flights for N people and the user now adds a hotel/car request, reuse N. Do NOT silently fall back to the per-tool default (1 for flights, 2 for hotels).
  - For \`search_hotels\`, also derive \`rooms\` from the party size + saved \`default_rooms\` (e.g. 2 adults → 1 room, 4 adults → 2 rooms unless the user said otherwise).
  - If party size is genuinely unknown AND the user is asking for a bundle, ask ONCE via ask_user before firing any search tools — don't guess different values per tool.
- NEVER repeat in prose what the result cards already show. The UI renders rich cards for flights, hotels, cars, AND a trip-bundle card with its own price breakdown and total. Your text reply must be a 1–2 sentence intro ONLY (e.g. "Here's a Hamburg→Barcelona bundle for May 8–11.") — do NOT list flight times, hotel names, prices, ratings, or compute totals in markdown. The card does that.
- Specifically for bundles: do NOT write things like "Flight: €578 total", "Hotel: Marina Resort", or "Total: €1,271". The bundle card renders all of that. One short sentence is enough.
- Use markdown only for that short sentence. Never paste raw JSON. Never use bullet lists to re-describe results.
- Today's date is ${new Date().toISOString().slice(0, 10)}.`;

function buildPreferenceSnippet(prefs: any): string {
  if (!prefs) return "";
  const lines: string[] = [];
  if (prefs.home_city) lines.push(`Home city: ${prefs.home_city}`);
  if (prefs.preferred_currency && prefs.preferred_currency !== "EUR") lines.push(`Currency: ${prefs.preferred_currency}`);
  if (prefs.default_adults || prefs.default_children || prefs.default_rooms)
    lines.push(`Default party: ${prefs.default_adults ?? 1} adult(s), ${prefs.default_children ?? 0} child(ren), ${prefs.default_rooms ?? 1} room(s)`);
  if (prefs.preferred_cabin_class) lines.push(`Cabin: ${prefs.preferred_cabin_class}`);
  if (prefs.direct_flights_only) lines.push(`Direct flights only: yes`);
  if (typeof prefs.max_stops === "number") lines.push(`Max stops: ${prefs.max_stops}`);
  if (prefs.baggage_preference) {
    const bagLabel: Record<string, string> = {
      none: "no bag (just clothes worn)",
      personal: "personal item / backpack (~40×20×25cm, fits under seat)",
      carry_on: "cabin bag (~55×40×20cm, overhead bin)",
      checked: "checked bag (158cm linear · ~23kg)",
    };
    lines.push(`Usual baggage: ${bagLabel[prefs.baggage_preference] ?? prefs.baggage_preference}`);
  }
  if (prefs.checked_bags && prefs.checked_bags > 0)
    lines.push(`Checked bags by default: ${prefs.checked_bags}`);
  if (prefs.max_carry_on_weight_kg)
    lines.push(`Carry-on weight target: up to ${prefs.max_carry_on_weight_kg}kg (warn the user if a fare/airline enforces a stricter limit)`);
  if (prefs.prefer_no_long_layovers)
    lines.push(`Avoid layovers longer than ~4 hours.`);
  if (prefs.preferred_airlines?.length) lines.push(`Preferred airlines: ${prefs.preferred_airlines.join(", ")}`);
  if (prefs.avoided_airlines?.length) lines.push(`Avoid airlines: ${prefs.avoided_airlines.join(", ")}`);
  if (prefs.min_hotel_stars) lines.push(`Min hotel stars: ${prefs.min_hotel_stars}`);
  if (prefs.min_hotel_rating) lines.push(`Min hotel rating: ${prefs.min_hotel_rating}`);
  if (prefs.preferred_hotel_amenities?.length) lines.push(`Hotel amenities wanted: ${prefs.preferred_hotel_amenities.join(", ")}`);
  if (prefs.preferred_hotel_brands?.length) lines.push(`Preferred hotel brands: ${prefs.preferred_hotel_brands.join(", ")}`);
  if (prefs.preferred_car_transmission) lines.push(`Car transmission: ${prefs.preferred_car_transmission}`);
  if (prefs.preferred_car_class) lines.push(`Car class: ${prefs.preferred_car_class}`);
  if (prefs.min_car_seats) lines.push(`Min car seats: ${prefs.min_car_seats}`);
  if (prefs.budget_level) lines.push(`Budget level: ${prefs.budget_level}`);
  if (prefs.notes) lines.push(`User notes: ${prefs.notes}`);
  if (lines.length === 0) return "";
  return `\n\nUSER TRAVEL PREFERENCES (apply silently as bias; user can update them on the Settings page):\n- ${lines.join("\n- ")}`;
}

function buildProfileSnippet(profile: any): string {
  if (!profile) return "";
  const addrParts = [profile.home_street, profile.home_city, profile.home_postal_code, profile.home_country].filter(Boolean);
  if (addrParts.length === 0) return "";
  const fullAddress = addrParts.join(", ");
  const askFirst = profile.ask_before_using_home_address !== false;
  const lines: string[] = [];
  lines.push(`Home address on file: ${fullAddress}`);
  if (profile.passport_country) lines.push(`Passport country: ${profile.passport_country}`);
  const behavior = askFirst
    ? `If the user asks about flights/cars without specifying a departure or pickup location, ask via ask_user with a TWO-FIELD pattern in a single call:
    1) A boolean field { id:"use_home_address", label:"Use your saved home (${profile.home_city ?? fullAddress})?", type:"boolean", default:true }
    2) A text field { id:"alternate_origin", label:"Departure city instead", type:"text", placeholder:"e.g. ${profile.home_city ?? "Paris"}", default:"${profile.home_city ?? ""}", showIf:{ id:"use_home_address", equals:false } }
    The text field is hidden until the toggle is off. Pre-filling it with the saved city gives the user a starting point they can edit. Never ask the city question without the showIf pattern.`
    : `If the user asks about flights/cars without specifying a departure or pickup location, silently use the home city (${profile.home_city ?? fullAddress}) as the default — DO NOT call ask_user about it — and mention it once like "Searching from your saved home in ${profile.home_city ?? "your home address"}…". The user has opted out of being asked. If they explicitly want a different origin, they'll tell you.`;
  return `\n\nUSER PROFILE (only use the address as a default departure/pickup; don't volunteer other personal info):\n- ${lines.join("\n- ")}\n- ${behavior}`;
}

function functionToEdgeName(name: string): string {
  if (name === "search_places") return "skyscanner-places";
  if (name === "search_flights") return "skyscanner-flights";
  if (name === "search_hotels") return "wanderlush-hotels";
  if (name === "search_cars") return "wanderlush-cars";
  throw new Error(`Unknown tool: ${name}`);
}

function pickResultsBlock(toolName: string, toolResult: any) {
  if (toolName === "search_flights" && Array.isArray(toolResult?.offers) && toolResult.offers.length) {
    return { kind: "flights", query: "Live Skyscanner results", offers: toolResult.offers };
  }
  if (toolName === "search_hotels" && Array.isArray(toolResult?.hotels) && toolResult.hotels.length) {
    return { kind: "hotels", query: "Wanderlush Stays · mock inventory", offers: toolResult.hotels };
  }
  if (toolName === "search_cars" && Array.isArray(toolResult?.cars) && toolResult.cars.length) {
    return { kind: "cars", query: "Wanderlush Wheels · mock inventory", offers: toolResult.cars };
  }
  if (toolName === "search_hotels" && toolResult?.summary) {
    return {
      kind: "hotelSummary",
      query: toolResult.summary.destination ?? "Hotel price overview",
      summary: toolResult.summary,
    };
  }
  return null;
}

/**
 * Combine multiple result blocks (e.g. flights + cars) into a single bundle so
 * the UI can show a "trip total" card. We collapse duplicates of the same kind
 * by keeping the latest one (Mistral may re-search after refining) and compute
 * a *duration-aware* low-end total using the cheapest offer of each block.
 *
 * Why duration-aware?
 *   - Flights have no notion of "days", but cars/hotels do.
 *   - A flight is for the whole trip, but the cheapest car/hotel offer may cover
 *     a shorter span than the actual trip the user asked about.
 *   - We pick a canonical trip length (preferring the flight outbound→return
 *     window when available, falling back to the longest car/hotel duration)
 *     and scale per-day/per-night components to that span.
 */
function buildBundle(blocks: any[]) {
  if (blocks.length < 2) return null;

  // De-duplicate by kind, keeping the most recent occurrence.
  const byKind = new Map<string, any>();
  for (const b of blocks) byKind.set(b.kind, b);
  const unique = Array.from(byKind.values());
  if (unique.length < 2) return null;

  // ---- Helpers ---------------------------------------------------------------

  const cheapestOf = <T,>(arr: T[], price: (o: T) => number): T =>
    arr.reduce((m, o) => (price(o) < price(m) ? o : m), arr[0]);

  const flightTotal = (o: any) => Number(o?.price) || 0;
  const carTotal = (o: any) => Number(o?.totalPrice ?? (o?.pricePerDay ?? 0) * (o?.totalDays || 1)) || 0;
  const hotelTotal = (o: any) =>
    Number(o?.totalPrice ?? (o?.pricePerNight ?? 0) * (o?.totalNights || 1)) || 0;

  const daysBetween = (aIso?: string, bIso?: string) => {
    if (!aIso || !bIso) return 0;
    const a = Date.parse(aIso);
    const b = Date.parse(bIso);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
  };

  // ---- 1. Pick the cheapest offer per block & infer durations ----------------

  const flights = unique.find((b) => b.kind === "flights");
  const hotels = unique.find((b) => b.kind === "hotels");
  const cars = unique.find((b) => b.kind === "cars");
  const hotelSummary = unique.find((b) => b.kind === "hotelSummary");

  const cheapFlight = flights?.offers?.length ? cheapestOf(flights.offers, flightTotal) : null;
  const cheapCar = cars?.offers?.length ? cheapestOf(cars.offers, carTotal) : null;
  const cheapHotel = hotels?.offers?.length ? cheapestOf(hotels.offers, hotelTotal) : null;

  // Trip span derived from the flight's outbound → return ISO dates if present,
  // else the longest car/hotel/summary duration we have on hand.
  const flightSpan = cheapFlight
    ? daysBetween(cheapFlight.outbound?.from?.isoDate, cheapFlight.return?.from?.isoDate)
    : 0;
  const carDays = cheapCar?.totalDays ?? 0;
  const hotelNights = cheapHotel?.totalNights ?? hotelSummary?.summary?.totalNights ?? 0;

  // Canonical trip length used to scale per-day/per-night components.
  const tripDays = Math.max(flightSpan, carDays, hotelNights, 0);

  // ---- 2. Sum a duration-normalised total ------------------------------------
  // Convert every component to a single anchor currency using rough FX rates
  // so we never silently drop a leg just because the API returned EUR vs USD.

  // Approx FX rates → 1 unit = N USD. Realistic enough for an indicative total.
  const FX_TO_USD: Record<string, number> = {
    USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.13, JPY: 0.0067, CNY: 0.14,
    AUD: 0.66, NZD: 0.61, CAD: 0.74, MXN: 0.058, BRL: 0.20, ARS: 0.0011,
    CLP: 0.0011, COP: 0.00025, PEN: 0.27,
    AED: 0.27, SAR: 0.27, QAR: 0.27, BHD: 2.65, KWD: 3.25, OMR: 2.60,
    INR: 0.012, PKR: 0.0036, BDT: 0.0091, LKR: 0.0033, NPR: 0.0075,
    THB: 0.028, VND: 0.000041, IDR: 0.000063, MYR: 0.21, SGD: 0.74, PHP: 0.018, KRW: 0.00073, TWD: 0.031, HKD: 0.13,
    TRY: 0.030, ILS: 0.27, EGP: 0.020, MAD: 0.10, ZAR: 0.054,
    DKK: 0.145, SEK: 0.094, NOK: 0.092, ISK: 0.0072,
    PLN: 0.25, CZK: 0.043, HUF: 0.0027, RON: 0.22, BGN: 0.55,
    RUB: 0.011, UAH: 0.024, BYN: 0.30,
    KES: 0.0077, NGN: 0.00067,
  };
  const toUsd = (n: number, c?: string) => {
    if (!c) return n;
    const r = FX_TO_USD[c.toUpperCase()];
    return r ? n * r : n; // unknown currency → assume already USD-ish
  };

  // Anchor currency: prefer the flight's currency (usually the user's market),
  // else the hotel's, else the car's, else EUR.
  const anchor: string =
    cheapFlight?.currency ?? cheapHotel?.currency ?? hotelSummary?.summary?.currency ?? cheapCar?.currency ?? "EUR";
  const fromUsd = (usd: number) => {
    const r = FX_TO_USD[anchor.toUpperCase()] ?? 1;
    return r ? usd / r : usd;
  };
  const convert = (n: number, c?: string) => fromUsd(toUsd(n, c));

  let amountUsd = 0;
  const parts: string[] = [];
  let convertedSomething = false;

  // Flights — single trip price, never scaled.
  if (cheapFlight) {
    amountUsd += toUsd(flightTotal(cheapFlight), cheapFlight.currency);
    parts.push("flights");
    if (cheapFlight.currency && cheapFlight.currency !== anchor) convertedSomething = true;
  }

  // Cars — scale to canonical trip length when known, else use the offer's own days.
  if (cheapCar) {
    const span = tripDays > 0 ? tripDays : (cheapCar.totalDays || 1);
    const perDay = Number(cheapCar.pricePerDay) || (carTotal(cheapCar) / Math.max(1, cheapCar.totalDays || 1));
    amountUsd += toUsd(perDay * span, cheapCar.currency);
    parts.push(`car × ${span}d`);
    if (cheapCar.currency && cheapCar.currency !== anchor) convertedSomething = true;
  }

  // Hotels — same idea, but in nights.
  if (cheapHotel) {
    const span = tripDays > 0 ? tripDays : (cheapHotel.totalNights || 1);
    const perNight = Number(cheapHotel.pricePerNight) || (hotelTotal(cheapHotel) / Math.max(1, cheapHotel.totalNights || 1));
    amountUsd += toUsd(perNight * span, cheapHotel.currency);
    parts.push(`hotel × ${span}n`);
    if (cheapHotel.currency && cheapHotel.currency !== anchor) convertedSomething = true;
  } else if (hotelSummary?.summary?.cheapest != null) {
    const sum = hotelSummary.summary;
    const span = tripDays > 0 ? tripDays : (sum.totalNights || 1);
    amountUsd += toUsd(Number(sum.cheapest) * span, sum.currency);
    parts.push(`hotel est. × ${span}n`);
    if (sum.currency && sum.currency !== anchor) convertedSomething = true;
  }

  const amount = fromUsd(amountUsd);
  const currency = anchor;

  const labelMap: Record<string, string> = {
    flights: "Flights",
    hotels: "Hotels",
    cars: "Cars",
    hotelSummary: "Hotel estimate",
  };
  const queryLabel = unique.map((b) => labelMap[b.kind] ?? b.kind).join(" + ");

  // Per-component breakdown the UI can render as chips with their own prices.
  const breakdown: Array<{ kind: string; label: string; amount: number; currency: string; detail?: string }> = [];
  if (cheapFlight) {
    breakdown.push({
      kind: "flights",
      label: "Flights",
      amount: Math.round(convert(flightTotal(cheapFlight), cheapFlight.currency)),
      currency,
      detail: "round trip",
    });
  }
  if (cheapHotel) {
    const span = tripDays > 0 ? tripDays : (cheapHotel.totalNights || 1);
    const perNight = Number(cheapHotel.pricePerNight) || (hotelTotal(cheapHotel) / Math.max(1, cheapHotel.totalNights || 1));
    breakdown.push({
      kind: "hotels",
      label: "Hotel",
      amount: Math.round(convert(perNight * span, cheapHotel.currency)),
      currency,
      detail: `${span} night${span === 1 ? "" : "s"}`,
    });
  } else if (hotelSummary?.summary?.cheapest != null) {
    const sum = hotelSummary.summary;
    const span = tripDays > 0 ? tripDays : (sum.totalNights || 1);
    breakdown.push({
      kind: "hotelSummary",
      label: "Hotel est.",
      amount: Math.round(convert(Number(sum.cheapest) * span, sum.currency)),
      currency,
      detail: `${span} night${span === 1 ? "" : "s"} · estimate`,
    });
  }
  if (cheapCar) {
    const span = tripDays > 0 ? tripDays : (cheapCar.totalDays || 1);
    const perDay = Number(cheapCar.pricePerDay) || (carTotal(cheapCar) / Math.max(1, cheapCar.totalDays || 1));
    breakdown.push({
      kind: "cars",
      label: "Car",
      amount: Math.round(convert(perDay * span, cheapCar.currency)),
      currency,
      detail: `${span} day${span === 1 ? "" : "s"}`,
    });
  }

  return {
    kind: "bundle",
    query: queryLabel,
    blocks: unique,
    total: amount > 0 && currency
      ? {
          amount: Math.round(amount),
          currency,
          basis: tripDays > 0
            ? `cheapest combo · ${tripDays}-day trip${convertedSomething ? " · converted" : ""}`
            : `cheapest ${parts.join(" + ")}${convertedSomething ? " · converted" : ""}`,
          days: tripDays > 0 ? tripDays : undefined,
          breakdown,
        }
      : undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client (RLS applies) — used for all DB ops
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversationId, content, overrides } = await req.json();
    if (!conversationId || !content) {
      return new Response(JSON.stringify({ error: "conversationId and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Persist the user message
    const { error: userMsgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content,
    });
    if (userMsgErr) throw userMsgErr;

    // 2. Load full history (including the message we just added) for context
    const { data: history, error: histErr } = await supabase
      .from("messages")
      .select("role, content, tool_calls, tool_call_id, name, results, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (histErr) throw histErr;

    // 2b. Load user travel preferences once and inject them as bias into system prompt
    const { data: prefsRow } = await supabase
      .from("user_travel_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    // 2c. Load user profile (home address etc.) for default-departure suggestions.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name, home_street, home_city, home_postal_code, home_country, passport_country, ask_before_using_home_address")
      .eq("id", user.id)
      .maybeSingle();
    // Merge transient per-chat overrides on top of saved defaults (NOT persisted).
    const mergedPrefs =
      overrides && typeof overrides === "object"
        ? { ...(prefsRow ?? {}), ...overrides }
        : prefsRow;
    const hasOverrides = !!overrides && Object.keys(overrides).length > 0;
    const SYSTEM_PROMPT =
      BASE_SYSTEM_PROMPT +
      buildPreferenceSnippet(mergedPrefs) +
      buildProfileSnippet(profileRow) +
      (hasOverrides
        ? `\n\nNOTE: The user has applied per-chat filter overrides for this conversation only — they replace the corresponding saved defaults above. Don't offer to save them.`
        : "");

    // 3. Build Mistral message array
    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
    // Sanitize history before sending to Mistral. Mistral strictly requires:
    //   - every assistant `tool_calls` entry must be IMMEDIATELY followed by
    //     one `tool` message per tool_call_id, in the same order;
    //   - `tool` messages may only appear right after such an assistant turn.
    // Older runs sometimes left orphan tool_calls / tool messages in the DB
    // (e.g. when the function crashed mid-loop), which then poisons every
    // subsequent request. We rebuild the array defensively here.
    const raw = history ?? [];
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i];
      if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
        continue;
      }
      if (m.role === "assistant") {
        const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls : null;
        if (toolCalls && toolCalls.length > 0) {
          // Look ahead for matching tool responses (one per call id).
          const expected = toolCalls.map((tc: any) => tc.id).filter(Boolean);
          const responses = new Map<string, any>();
          let j = i + 1;
          while (j < raw.length && raw[j].role === "tool") {
            const tc = raw[j];
            if (tc.tool_call_id && !responses.has(tc.tool_call_id)) {
              responses.set(tc.tool_call_id, tc);
            }
            j++;
          }
          const allMatched = expected.every((id: string) => responses.has(id));
          if (!allMatched) {
            // Drop the orphan assistant tool_call and any tool messages that
            // followed it — they would make Mistral 400 the request.
            i = j - 1;
            continue;
          }
          messages.push({
            role: "assistant",
            content: m.content ?? "",
            tool_calls: toolCalls,
          });
          for (const id of expected) {
            const tc = responses.get(id);
            messages.push({
              role: "tool",
              name: tc.name ?? undefined,
              tool_call_id: tc.tool_call_id,
              content: tc.content ?? "",
            });
          }
          i = j - 1;
          continue;
        }
        // Plain assistant text message — only push if it has content,
        // otherwise it confuses Mistral (empty assistant turn after a user).
        if ((m.content ?? "").trim().length > 0) {
          messages.push({ role: "assistant", content: m.content });
        }
        continue;
      }
      // Stray `tool` message with no preceding assistant tool_calls — skip.
    }

    // 3b. Inject a SYSTEM reminder of any interactive question card we already
    // showed in this conversation. The `ask_user` short-circuit (further down)
    // doesn't persist `tool_calls`, so without this nudge Mistral can't see it
    // ever asked anything via the form — and tends to ask the same questions
    // again after the user replies in free text.
    const askedQuestions: string[] = [];
    for (const m of history ?? []) {
      const r: any = (m as any).results;
      if (m.role === "assistant" && r?.kind === "questions" && Array.isArray(r.questions)) {
        for (const q of r.questions) {
          if (q && typeof q.label === "string") askedQuestions.push(q.label);
        }
      }
    }
    if (askedQuestions.length > 0) {
      // De-duplicate while preserving order so a long thread doesn't blow up the prompt.
      const seen = new Set<string>();
      const uniqueAsked = askedQuestions.filter((q) => (seen.has(q) ? false : (seen.add(q), true)));
      messages.push({
        role: "system",
        content:
          `You have ALREADY asked the user the following question(s) earlier in this conversation via the interactive form:\n- ${uniqueAsked.join("\n- ")}\n\nDo NOT ask any of these again. Treat the user's most recent message as the answer(s) and proceed directly to the search. If a few of those answers are still genuinely ambiguous, infer a sensible default and mention it briefly instead of re-asking.`,
      });
    }

    // 3c. Collect result blocks from EARLIER assistant messages so a bundle can
    // span multiple user turns (e.g. user asks for flights first, then a hotel).
    // Without this, buildBundle only sees the current turn and we never emit a
    // bundle card when the searches were spread across several messages.
    const priorBlocks: any[] = [];
    for (const m of history ?? []) {
      const r: any = (m as any).results;
      if (m.role !== "assistant" || !r) continue;
      if (r.kind === "flights" || r.kind === "hotels" || r.kind === "cars" || r.kind === "hotelSummary") {
        priorBlocks.push(r);
      } else if (r.kind === "bundle" && Array.isArray(r.blocks)) {
        for (const b of r.blocks) priorBlocks.push(b);
      }
    }

    // 4. Tool-calling loop (max 5 iterations to be safe)
    let finalAssistantText = "";
    let resultsBlock: any = null;
    // Collect every meaningful sub-block produced during this turn so we can
    // bundle them (e.g., flights + cars in the same answer).
    const turnBlocks: any[] = [];

    // Hard deadline for the entire turn. Supabase Edge runtime kills the
    // request at ~150s of idle time; we stop earlier so we can always return
    // a graceful reply (with whatever blocks we already collected) instead of
    // a 504. Per-Mistral call also has its own AbortController timeout.
    const TURN_DEADLINE_MS = 135_000;
    const MISTRAL_TIMEOUT_MS = 35_000;
    const turnStart = Date.now();
    const turnTimeLeft = () => TURN_DEADLINE_MS - (Date.now() - turnStart);
    let timedOut = false;

    // Mistral occasionally returns `content` as an array of `{type, text}` parts
    // and sometimes smuggles tool-call payloads INTO the prose as JSON-shaped
    // fragments (e.g. `search_flights{"originEntityId":"…"}`) plus stray CJK
    // glue tokens. Normalise every assistant `content` we see before persisting
    // it so users never see raw JSON in the chat transcript.
    const normalizeChoiceContent = (c: unknown): string => {
      let s = "";
      if (typeof c === "string") s = c;
      else if (Array.isArray(c)) {
        s = (c as any[])
          .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
          .join(" ");
      } else if (c != null) s = String(c);
      // Strip embedded pseudo-tool-call payloads.
      s = s.replace(/\b[a-z_][a-z0-9_]*\s*\{[\s\S]*?\}/gi, "");
      // Strip CJK glue characters Mistral injects between fragments.
      s = s.replace(/[\u3000-\u303F\u3400-\u9FFF\uFF00-\uFFEF]+/g, "");
      return s.replace(/\s+/g, " ").trim();
    };

    for (let iter = 0; iter < 5; iter++) {
      // Bail out before we hit the platform's 150s idle timeout.
      if (turnTimeLeft() <= 5_000) {
        timedOut = true;
        break;
      }

      const mistralCtrl = new AbortController();
      const perCall = Math.min(MISTRAL_TIMEOUT_MS, Math.max(5_000, turnTimeLeft() - 2_000));
      const mistralTimer = setTimeout(() => mistralCtrl.abort(), perCall);
      let mistralResp: Response;
      try {
        mistralResp = await fetch(MISTRAL_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages,
            tools,
            tool_choice: "auto",
          }),
          signal: mistralCtrl.signal,
        });
      } catch (err) {
        clearTimeout(mistralTimer);
        const aborted = (err as any)?.name === "AbortError";
        console.error("Mistral fetch failed", aborted ? "timeout" : err);
        timedOut = true;
        break;
      }
      clearTimeout(mistralTimer);

      if (!mistralResp.ok) {
        const t = await mistralResp.text();
        console.error("Mistral error", mistralResp.status, t);
        if (mistralResp.status === 429) {
          return new Response(JSON.stringify({ error: "Mistral rate limit reached. Please try again in a moment." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Mistral error", details: t }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await mistralResp.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("Empty Mistral response");

      const toolCalls = choice.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Special-case: ask_user is a "render" tool, not a data fetch. We intercept
        // the call, persist it as the assistant reply with a structured questions
        // block, and short-circuit the loop. The user's next message will be their
        // answers — no second Mistral round-trip needed.
        const askCall = toolCalls.find((t: any) => t?.function?.name === "ask_user");
        if (askCall) {
          let askArgs: any = {};
          try {
            askArgs = JSON.parse(askCall.function?.arguments ?? "{}");
          } catch (_) {
            askArgs = {};
          }
          const rawQuestions = Array.isArray(askArgs?.questions) ? askArgs.questions : [];
          // Defensive normalization — drop malformed entries the model may emit.
          const questions = rawQuestions
            .filter((q: any) => q && typeof q.id === "string" && typeof q.label === "string" && typeof q.type === "string")
            .map((q: any) => {
              const base: any = { id: q.id, label: q.label, type: q.type };
              if (typeof q.hint === "string") base.hint = q.hint;
              if (typeof q.required === "boolean") base.required = q.required;
              // Conditional visibility (e.g. show "alternate origin" only when "use home address" is false).
              if (q.showIf && typeof q.showIf === "object" && typeof q.showIf.id === "string" && q.showIf.equals !== undefined) {
                base.showIf = { id: q.showIf.id, equals: q.showIf.equals };
              }
              if (q.type === "single" || q.type === "multi") {
                base.options = Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === "string") : [];
                if (q.type === "single" && typeof q.default === "string") base.default = q.default;
                if (q.type === "multi" && Array.isArray(q.default)) {
                  base.default = q.default.filter((o: any) => typeof o === "string");
                }
              }
              if (q.type === "boolean" && typeof q.default === "boolean") {
                base.default = q.default;
              }
              if (q.type === "text") {
                if (typeof q.placeholder === "string") base.placeholder = q.placeholder;
                if (q.format === "email" || q.format === "number" || q.format === "tel") base.format = q.format;
                if (typeof q.minLength === "number") base.minLength = q.minLength;
                if (typeof q.maxLength === "number") base.maxLength = q.maxLength;
                if (typeof q.min === "number") base.min = q.min;
                if (typeof q.max === "number") base.max = q.max;
                if (typeof q.default === "string") base.default = q.default;
              }
              if (q.type === "number") {
                if (typeof q.placeholder === "string") base.placeholder = q.placeholder;
                if (typeof q.min === "number") base.min = q.min;
                if (typeof q.max === "number") base.max = q.max;
                if (typeof q.step === "number") base.step = q.step;
                if (typeof q.default === "number") base.default = q.default;
              }
              if (q.type === "date") {
                if (typeof q.minDate === "string") base.minDate = q.minDate;
                if (typeof q.maxDate === "string") base.maxDate = q.maxDate;
                if (typeof q.default === "string") base.default = q.default;
              }
              return base;
            })
            .slice(0, 5);

          if (questions.length > 0) {
            const cleanChoice = normalizeChoiceContent(choice.content);
            const promptText = (typeof askArgs?.prompt === "string" && askArgs.prompt.trim()) || cleanChoice || "Quick check —";
            const submitLabel = typeof askArgs?.submitLabel === "string" ? askArgs.submitLabel : undefined;
            resultsBlock = { kind: "questions", query: "Just a few details", questions, ...(submitLabel ? { submitLabel } : {}) };
            finalAssistantText = promptText;
            break;
          }
          // If somehow malformed, fall through to normal handling below.
        }

        // Persist the assistant tool-call message
        const cleanedToolMsg = normalizeChoiceContent(choice.content);
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: cleanedToolMsg,
          tool_calls: toolCalls,
        });
        messages.push({ role: "assistant", content: cleanedToolMsg, tool_calls: toolCalls });

        // Execute every tool call
        for (const tc of toolCalls) {
          const fnName = tc.function?.name;
          let args: any = {};
          try {
            args = JSON.parse(tc.function?.arguments ?? "{}");
          } catch (_) {
            args = {};
          }

          let toolResult: any;
          try {
            // Local DB-backed tools (run with user-scoped client, RLS enforced)
            if (fnName === "list_favorite_hotels") {
              const { data, error } = await supabase
                .from("favorite_hotels")
                .select("hotel_id, note, created_at, hotels(id, name, city, country, area, stars, rating, brand, image_url, amenities)")
                .order("created_at", { ascending: false });
              if (error) throw error;
              toolResult = { favorites: data ?? [], count: data?.length ?? 0 };
            } else if (fnName === "add_favorite_hotel") {
              const { hotelId, note } = args ?? {};
              if (!hotelId) {
                toolResult = { error: "hotelId required" };
              } else {
                const { data, error } = await supabase
                  .from("favorite_hotels")
                  .upsert({ user_id: user.id, hotel_id: hotelId, note: note ?? null }, { onConflict: "user_id,hotel_id" })
                  .select("id, hotel_id, note")
                  .single();
                if (error) throw error;
                toolResult = { saved: true, favorite: data };
              }
            } else if (fnName === "remove_favorite_hotel") {
              const { hotelId } = args ?? {};
              if (!hotelId) {
                toolResult = { error: "hotelId required" };
              } else {
                const { error } = await supabase
                  .from("favorite_hotels")
                  .delete()
                  .eq("hotel_id", hotelId);
                if (error) throw error;
                toolResult = { removed: true };
              }
            } else if (fnName === "get_user_preferences") {
              const { data } = await supabase
                .from("user_travel_preferences")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();
              toolResult = { preferences: data ?? null };
            } else if (fnName === "update_user_preferences") {
              const payload = { ...(args ?? {}), user_id: user.id };
              const { data, error } = await supabase
                .from("user_travel_preferences")
                .upsert(payload, { onConflict: "user_id" })
                .select("*")
                .single();
              if (error) throw error;
              toolResult = { saved: true, preferences: data };
            } else {
              const edgeFn = functionToEdgeName(fnName);
              const fnResp = await fetch(`${SUPABASE_URL}/functions/v1/${edgeFn}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: authHeader,
                  apikey: SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(args),
              });
              toolResult = await fnResp.json();
            }
          } catch (e) {
            toolResult = { error: e instanceof Error ? e.message : String(e) };
          }

          // Capture the latest meaningful results block to attach to the final assistant message
          const block = pickResultsBlock(fnName, toolResult);
          if (block) {
            resultsBlock = block;
            turnBlocks.push(block);
          }

          const toolContentStr = JSON.stringify(toolResult).slice(0, 12000); // truncate huge payloads

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "tool",
            content: toolContentStr,
            tool_call_id: tc.id,
            name: fnName,
          });
          messages.push({
            role: "tool",
            name: fnName,
            tool_call_id: tc.id,
            content: toolContentStr,
          });
        }
        // Continue the loop so Mistral can respond to the tool results
        continue;
      }

      // No tool calls — final assistant response
      finalAssistantText = normalizeChoiceContent(choice.content);
      break;
    }

    if (!finalAssistantText) {
      if (timedOut) {
        // Prefer to surface any results we already gathered this turn so the
        // user gets value instead of just an apology.
        finalAssistantText =
          turnBlocks.length > 0
            ? "Here's what I found before things slowed down — let me know if you'd like me to refine the search."
            : "That took longer than expected on my end. Could you try again, or narrow the request a bit (specific dates / city)?";
      } else {
        finalAssistantText = "I wasn't able to complete that. Could you rephrase or share more details?";
      }
    }

    // Bundle eligibility — combine THIS turn's blocks with any earlier ones in
    // the conversation so a multi-turn build-up (flights one message, hotel the
    // next) still produces a single trip-bundle card. buildBundle de-duplicates
    // by kind, keeping the latest occurrence, which is exactly what we want.
    // We only emit a bundle when this turn actually produced at least one new
    // search result — otherwise a plain "thanks!" reply would re-render the
    // bundle for no reason.
    if (turnBlocks.length > 0) {
      const combined = [...priorBlocks, ...turnBlocks];
      const bundle = buildBundle(combined);
      if (bundle) resultsBlock = bundle;
    }

    // Persist final assistant reply (with results block)
    const { data: savedAssistant, error: saveErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: finalAssistantText,
        results: resultsBlock,
      })
      .select()
      .single();
    if (saveErr) throw saveErr;

    // Auto-title the conversation on the first user message.
    // `history` already contains the just-inserted user message, so the first
    // ever message means count === 1.
    const userMsgCount = (history ?? []).filter((m) => m.role === "user").length;
    if (userMsgCount <= 1) {
      const title = content.length > 50 ? content.slice(0, 50) + "…" : content;
      await supabase.from("conversations").update({ title }).eq("id", conversationId);
    }

    return new Response(
      JSON.stringify({
        message: {
          id: savedAssistant.id,
          role: "assistant",
          content: finalAssistantText,
          results: resultsBlock,
          createdAt: new Date(savedAssistant.created_at).getTime(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("travel-chat exception", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});