import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { User, ChevronDown, RefreshCw, Loader2, Plane, BedDouble, Search, Sparkles, Globe2, Wallet, Check, Timer, Radio, Lightbulb } from "lucide-react";
import { SkyguyLogo } from "@/components/brand/SkyguyLogo";
import type { ChatMessage } from "@/types/chat";
import { ResultsBlock } from "./ResultsBlock";
import { QuestionCard } from "./QuestionCard";
import { BundleBlock } from "./BundleBlock";
import type { Prefs } from "@/components/preferences/PreferencesForm";
import { cn } from "@/lib/utils";

const HOTEL_FAIL_PATTERNS = [
  /no live results/i,
  /no .*results were found/i,
  /unable to (fetch|access|retrieve)/i,
  /couldn'?t (fetch|find|retrieve)/i,
  /system limitation/i,
  /try again/i,
  /timed? ?out/i,
  /403/,
];

function looksLikeHotelOrPriceFailure(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.results) return false; // we got something back, no need to retry
  const c = message.content ?? "";
  if (!c) return false;
  const mentionsHotel = /hotel|stay|accommodation|price/i.test(c);
  if (!mentionsHotel) return false;
  return HOTEL_FAIL_PATTERNS.some((p) => p.test(c));
}

export function MessageBubble({
  message,
  onRetry,
  retrying = false,
  onAnswerQuestions,
  questionsDisabled = false,
  prefs,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  retrying?: boolean;
  onAnswerQuestions?: (formattedReply: string) => void;
  questionsDisabled?: boolean;
  /** Effective prefs (baseline + per-chat overrides) for pre-filling question fields. */
  prefs?: Prefs | null;
}) {
  const isUser = message.role === "user";
  const isQuestions = !isUser && message.results?.kind === "questions";
  // Only flight/hotel/car results trigger the collapse-by-default behavior;
  // question cards should always be visible alongside the lead-in text.
  const hasResults = !isUser && !!message.results && !isQuestions;
  // Bundles render their own self-contained hero card (price breakdown + per-kind
  // sub-cards). The AI's prose for those tends to duplicate the card content
  // (flight times, hotel name, total) which looks redundant — collapse it more
  // aggressively and keep the toggle if the user really wants to see the prose.
  const isBundle = message.results?.kind === "bundle";
  // When the assistant returns flight/hotel results, collapse the prose by default
  // so the user sees the routes first. Without results, keep the message expanded.
  const [expanded, setExpanded] = useState(!hasResults);
  // Mistral can return `content` as an array of parts (e.g. tool messages) or
  // even null. It also occasionally smuggles tool-call payloads INTO the prose
  // as JSON-shaped fragments like `search_flights{"originEntityId":"…"}` plus
  // stray CJK glue characters. Strip all of that before showing it to the user.
  const contentToString = (c: unknown): string => {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
        .join(" ");
    }
    if (c == null) return "";
    return String(c);
  };
  const sanitizePseudoToolCalls = (s: string): string => {
    let out = s;
    // 1. Remove tool-name preludes followed (anywhere on the same chunk) by a
    //    JSON-like object, e.g. `search_flights 1" {"originEntityId":"…"}` or
    //    `search_hotels{…}`. We match the tool name + any short run of junk
    //    (digits, quotes, punctuation) up to the next `{...}` blob.
    const TOOL_NAMES = [
      "search_flights", "search_hotels", "search_cars", "search_places",
      "ask_user", "save_favorite_hotel", "remove_favorite_hotel",
      "list_favorite_hotels", "save_preferences", "get_preferences",
    ];
    const toolRe = new RegExp(
      `\\b(?:${TOOL_NAMES.join("|")})\\b[\\s\\S]{0,20}?\\{[\\s\\S]*?\\}`,
      "gi",
    );
    out = out.replace(toolRe, "");
    // 2. Strip any leftover JSON-shaped blob that clearly carries tool-call
    //    keys (covers cases where the tool name itself was already stripped or
    //    never emitted). Matches a `{ ... }` object containing one of these.
    const PAYLOAD_KEYS = [
      "originEntityId", "destinationEntityId", "entityId",
      "departureDate", "returnDate", "checkIn", "checkOut",
      "cabinClass", "queryLegs", "checkInDate", "checkOutDate",
      "pickupDate", "vehicleClass", "transmission", "minStars",
      "minRating", "minSeats", "directOnly", "maxStops",
      "childrenAges", "adults", "rooms",
    ];
    const payloadRe = new RegExp(
      `\\{[^{}]*"(?:${PAYLOAD_KEYS.join("|")})"[\\s\\S]*?\\}`,
      "g",
    );
    out = out.replace(payloadRe, "");
    // 2b. Strip JSON FRAGMENTS (no opening brace) that are clearly leaked tool
    //     args, e.g. `, "returnDate": {"year": 2026, ...}, "adults": 2` —
    //     anything from the first stray `, "<payloadKey>"` up to the end of the
    //     surrounding run of JSON-ish characters.
    const fragRe = new RegExp(
      `,?\\s*"(?:${PAYLOAD_KEYS.join("|")})"\\s*:\\s*[\\s\\S]*?(?=$|[A-Za-z][A-Za-z ]{3,})`,
      "g",
    );
    out = out.replace(fragRe, "");
    // 2c. Strip runaway closing-brace runs (e.g. "}}}}}}}}}}}").
    out = out.replace(/[}\])]{3,}/g, "");
    // 2d. Drop orphan leading punctuation left behind after stripping.
    out = out.replace(/^[\s,;:}\])]+/, "");
    // 3. Strip stray CJK / control glue tokens Mistral sometimes emits between
    //    those fragments (e.g. "航空", "工具").
    out = out.replace(/[\u3000-\u303F\u3400-\u9FFF\uFF00-\uFFEF]+/g, "");
    return out.replace(/\s+/g, " ").trim();
  };
  const rawContent = sanitizePseudoToolCalls(contentToString(message.content).trim());
  // For bundles, keep only the very first sentence/paragraph of prose — the rest
  // is almost always a manual price breakdown the card already shows. This makes
  // older replies (saved before the prompt was tightened) look clean too.
  const displayContent = isBundle
    ? rawContent.split(/\n\n|(?<=[.!?])\s+(?=[A-Z])/)[0] ?? rawContent
    : rawContent;
  const hasContent = displayContent.length > 0;
  const showRetry = !!onRetry && looksLikeHotelOrPriceFailure(message);

  return (
    <div className={cn("flex w-full gap-3 animate-fade-in-up", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10">
          <SkyguyLogo className="h-5 w-5" />
        </div>
      )}

      <div className={cn("flex max-w-[85%] flex-col gap-1 md:max-w-[78%]", isUser && "items-end")}>
        {hasContent && (
          <div
            className={cn(
              "rounded-2xl text-sm leading-relaxed shadow-sm",
              isUser
                ? "rounded-br-md bg-primary text-primary-foreground px-4 py-2.5"
                : "rounded-bl-md border border-border bg-card text-card-foreground",
              !isUser && (hasResults ? "px-3 py-2" : "px-4 py-2.5"),
            )}
          >
            {hasResults ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform",
                      expanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  {expanded ? "Hide details" : "Show details"}
                </button>
                {expanded && (
                  <div className="prose prose-sm max-w-none px-1 pb-1 pt-2 text-card-foreground prose-p:my-1.5 prose-p:text-card-foreground prose-li:my-0.5 prose-li:text-card-foreground prose-ul:my-1.5 prose-strong:text-foreground">
                    <ReactMarkdown>{displayContent}</ReactMarkdown>
                  </div>
                )}
              </>
            ) : (
              <div
                className={cn(
                  "prose prose-sm max-w-none",
                  isUser
                    ? "prose-invert prose-p:my-1 prose-strong:text-primary-foreground"
                    : "text-card-foreground prose-p:my-1.5 prose-p:text-card-foreground prose-li:my-0.5 prose-li:text-card-foreground prose-ul:my-1.5 prose-strong:text-foreground",
                )}
              >
                <ReactMarkdown>{displayContent}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {message.results && !isUser && message.results.kind !== "questions" && (
          message.results.kind === "bundle"
            ? <BundleBlock block={message.results} />
            : <ResultsBlock block={message.results} />
        )}

        {isQuestions && message.results?.kind === "questions" && (
          <QuestionCard
            prompt={message.content}
            questions={message.results.questions}
            submitLabel={message.results.submitLabel}
            disabled={questionsDisabled}
            onSubmit={(formatted) => onAnswerQuestions?.(formatted)}
            prefs={prefs}
          />
        )}

        {showRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
            className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card"
          >
            {retrying ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Retrying…
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" />
                Try again
              </>
            )}
          </button>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

type TypingKind = "flights" | "hotels" | "places" | "thinking";

function detectKind(text: string | undefined): TypingKind {
  if (!text) return "thinking";
  const t = text.toLowerCase();
  if (/(hotel|stay|accommodation|room|night|resort)/.test(t)) return "hotels";
  if (/(flight|fly|airfare|airline|airport|one[- ]way|round[- ]trip)/.test(t)) return "flights";
  if (/(where|city|place|destination)/.test(t)) return "places";
  return "thinking";
}

// Rotating progress phases — gives the wait a sense of motion and tells the
// user *what* is being queried instead of staring at a static "loading…".
// Each phase shows for ~3s; the search itself can take 20–45s while we wait
// for Skyscanner to fully complete (which is when the cheapest fares arrive).
const PHASES: Record<TypingKind, Array<{ icon: typeof Plane; label: string }>> = {
  flights: [
    { icon: Search, label: "Looking up airports…" },
    { icon: Plane, label: "Querying Skyscanner for live flights…" },
    { icon: Globe2, label: "Polling airlines for fresh prices…" },
    { icon: Wallet, label: "Waiting for cheaper fares to come in…" },
    { icon: Sparkles, label: "Picking the best deals for you…" },
  ],
  hotels: [
    { icon: Search, label: "Finding the destination…" },
    { icon: BedDouble, label: "Querying Skyscanner for live hotel rates…" },
    { icon: Globe2, label: "Comparing room prices across providers…" },
    { icon: Wallet, label: "Waiting for late-arriving cheaper rates…" },
    { icon: Sparkles, label: "Ranking the best stays…" },
  ],
  places: [
    { icon: Search, label: "Looking up destinations…" },
    { icon: Globe2, label: "Cross-checking cities and airports…" },
  ],
  thinking: [
    { icon: Sparkles, label: "Skyguy is thinking…" },
    { icon: Sparkles, label: "Putting your trip together…" },
  ],
};

const KIND_HEADER: Record<TypingKind, { label: string; sub: string }> = {
  flights: { label: "Polling Skyscanner — Flights", sub: "Live fares, refreshing as airlines respond" },
  hotels: { label: "Polling Skyscanner — Hotels", sub: "Live room rates, refreshing as providers respond" },
  places: { label: "Looking up destinations", sub: "Resolving cities and airports" },
  thinking: { label: "Skyguy is working", sub: "Putting your trip together" },
};

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// Fun facts, in-jokes and gimmicks about HackUPC — rotated every ~6s while
// the user waits. Skyscanner is a long-time HackUPC sponsor so this doubles
// as a wink to the judges. Mix of real lore, hackathon survival tips and
// playful nods to the Barcelona campus experience.
const HACKUPC_FACTS: string[] = [
  // ── Origin & scale ─────────────────────────────────────────────
  "HackUPC is one of Europe's largest student hackathons, held at UPC in Barcelona.",
  "The first HackUPC took place in 2015 and has grown every edition since.",
  "Over 700 hackers from 50+ countries fly in to UPC's North Campus each spring.",
  "There's a Spring AND an Autumn edition — twice the chaos, twice the swag.",
  "HackUPC is organised entirely by UPC students, no professors required.",
  "The whole event runs for 36 hours straight — hackers literally sleep under the tables.",
  "HackUPC has hosted teams from MIT, ETH Zürich, TU Delft, Cambridge and Imperial.",
  "More than 10,000 hackers have participated in HackUPC since 2015.",

  // ── Sponsors & tech ────────────────────────────────────────────
  "Skyscanner has been a long-time sponsor of HackUPC — this app uses their live API!",
  "Skyscanner's flight search API powers thousands of HackUPC projects every year.",
  "Mistral AI, the team behind Skyguy's brain, is one of Europe's leading LLM labs.",
  "Past HackUPC sponsors include Cloudflare, MongoDB, GitHub, Vercel, and IBM.",
  "The Hardware Lab lets teams borrow VR headsets, drones, Arduinos and IoT kits.",
  "Lovable spins up full-stack apps in minutes — perfect for a 36-hour build.",
  "Supabase Edge Functions handle all of Skyguy's flight, hotel and car searches.",

  // ── Hackathon survival lore ────────────────────────────────────
  "Pro tip: the line for the coffee machine at 3am is ALWAYS the longest.",
  "Hacker rule #1 — commit early, commit often. Git stash is not a backup.",
  "The unofficial HackUPC food pyramid: pizza, energy drinks, more pizza.",
  "Mate, club-mate and yerba mate fuel an estimated 60% of HackUPC commits.",
  "Sleeping in a HackUPC hammock at 5am hits different.",
  "Most HackUPC projects are conceived between hour 4 and hour 6 of the event.",
  "The 'demo bug' always shows up exactly 2 minutes before judging starts.",
  "If your code works on the first try at HackUPC, you probably forgot to push.",
  "Veteran hackers swear by the 'shower at hour 24' productivity reset.",

  // ── Activities & traditions ────────────────────────────────────
  "HackUPC's midnight activities have included karaoke, yoga and Just Dance battles.",
  "There's a tradition of late-night ping-pong tournaments in the Vèrtex building.",
  "The Sunday morning brunch with jamón ibérico is the unofficial HackUPC reward.",
  "Past HackUPC swag has included socks, custom keycaps, and even a rubber duck.",
  "Every hacker leaves with at least 3 sponsor t-shirts they'll wear ironically.",
  "The opening ceremony's keynote always under-runs. The judging never does.",
  "HackUPC alumni keep a private Discord that's still active years after graduating.",

  // ── Barcelona / campus flavour ─────────────────────────────────
  "UPC's North Campus is a 15-minute metro ride from Sagrada Família.",
  "Many hackers grab their first paella *after* the closing ceremony — never before.",
  "Vermut o'clock in Barcelona is 12pm sharp — fight us on it.",
  "The metro from El Prat (BCN) to UPC takes about 35 minutes — pack light.",
  "Bunkers del Carmel offers the best post-hackathon sunset in the city.",
  "Yes, the pigeons in Plaça Catalunya WILL judge your slide deck.",
  "Barcelona has 4.5km of beach within reach of the venue — bring sunscreen.",

  // ── Wins, projects & alumni ────────────────────────────────────
  "Past HackUPC winners have built AR navigation, AI tutors and gesture-controlled drones.",
  "Many HackUPC alumni now work at the very sponsors that funded their first hack.",
  "Several HackUPC projects have evolved into real YC-backed startups.",
  "Skyguy itself was built for HackUPC — judging starts soon, fingers crossed!",
  "The closing ceremony's demo expo is judged by engineers from Skyscanner & friends.",
  "Best-hack prizes have included drones, mechanical keyboards, and full-stack swag bags.",
  "HackUPC offers travel reimbursements so students from across Europe can attend.",

  // ── Meta & Skyguy easter eggs ──────────────────────────────────
  "Skyguy's mascot is a paper airplane — chosen because it costs €0 to fly.",
  "Every Skyguy chat is one Skyscanner API call closer to the rate limit ✈️",
  "Pro tip: ask Skyguy for a 'weekend in Barcelona' to support the home team.",
  "Fun fact: this loading message rotates every 6 seconds. You're already 1 fact in.",
  "Skyguy was 100% built during HackUPC — yes, including this loading screen.",

  // ── Hackathon jokes & one-liners ───────────────────────────────
  "Why did the hacker cross the road? To git to the other side.",
  "There are 10 types of HackUPC participants: those who sleep and those who deploy.",
  "Q: How many hackers does it take to change a lightbulb? A: None — that's a hardware problem.",
  "A SQL query walks into a bar, sees two tables, asks: 'Mind if I JOIN you?'",
  "Knock knock. — Who's there? — Recursion. — Recursion who? — Knock knock…",
  "I told my code to pull itself together. It threw a merge conflict instead.",
  "Real hackers don't debug. They 'enable verbose logging'.",
  "If at first you don't succeed, call it version 1.0 and ship it.",
  "Submitting at HackUPC: 90% Devpost, 10% praying the video uploads.",
  "The tabs vs spaces debate has caused more HackUPC drama than missing pizza.",
  "Your demo will work flawlessly until you start screen-sharing. Murphy's Law of HackUPC.",
  "Hackathon physics: time slows in the last hour and accelerates during sleep.",

  // ── Travel/Skyscanner geek facts ───────────────────────────────
  "BCN airport handles ~50 million passengers a year — yes, your Ryanair is one of them.",
  "Skyscanner indexes over 1,200 airlines and 100+ booking partners worldwide.",
  "The shortest commercial flight on Earth is 90 seconds long (Westray → Papa Westray, Scotland).",
  "The longest non-stop flight tops 18 hours — Singapore → New York. Pack snacks.",
  "Tuesdays at 3pm are statistically the cheapest time to book flights — usually.",
  "Cheapest day to FLY is often midweek; cheapest day to BOOK keeps changing — Skyguy will tell you.",
  "IATA codes are 3 letters; ICAO codes are 4. Skyscanner speaks both.",
  "The 'A' in BCN's IATA code stands for nothing — it's just 'BarCeloNa'.",
  "Some flight prices change up to 30 times a day. Welcome to revenue management.",
  "Skyscanner's 'Everywhere' search is the original digital escapism. 10/10 recommend.",

  // ── Barcelona deep cuts ────────────────────────────────────────
  "Sagrada Família has been under construction since 1882 — even slower than your CI pipeline.",
  "Gaudí designed Park Güell as a luxury housing project. It flopped. Now it's iconic.",
  "Barcelona's Eixample grid was designed in 1860 — chamfered corners, very HackUPC-friendly for skating.",
  "FC Barcelona's Camp Nou holds 99,354 seats — bigger than most HackUPC Slack workspaces.",
  "Barceloneta beach is artificial — built for the 1992 Olympics. It worked.",
  "The Magic Fountain of Montjuïc has free shows on weekend nights. Romantic AND free.",
  "Tibidabo's amusement park has been spinning since 1899 — older than airplanes themselves.",

  // ── Caffeine & survival, vol. 2 ────────────────────────────────
  "Cortado vs flat white vs espresso — pick your weapon, the night is long.",
  "The HackUPC coffee machine has seen more action than most PRs.",
  "Energy drink + cortado is forbidden alchemy. Effective. But forbidden.",
  "Pro tip: keep a water bottle next to your laptop. Future-you will thank past-you.",
  "Hour 18 hits like a kernel panic. Take 20 minutes outside, then ship.",
  "The Vèrtex bathroom mirrors at hour 30 reveal your true self. Be brave.",

  // ── Devpost & demo wisdom ──────────────────────────────────────
  "Record your demo video BEFORE the deadline panic. Trust us.",
  "Three slides max. Demo first, problem statement second, team photo last.",
  "Always demo on YOUR laptop. The judge's HDMI adapter is cursed.",
  "If your hack uses AI, mention it 4 times in 60 seconds. Industry standard.",
  "If your hack does NOT use AI, mention 'edge computing' instead.",
  "The best HackUPC demos open with a working product, not a slide deck.",

  // ── Cultural / multilingual fun ────────────────────────────────
  "'Déu n'hi do' is Catalan for 'wow, that's a lot' — useful at the buffet.",
  "'Vale' means 'okay' in Spanish. You'll say it 200 times this weekend.",
  "In Catalonia, lunch is at 2pm and dinner at 10pm. Adjust your snack schedule.",
  "'Tio/tia' = bro/sis. You'll hear it across the venue all weekend.",

  // ── Skyguy meta v2 ─────────────────────────────────────────────
  "Skyguy can search flights, hotels AND cars in one go — try a 'weekend in Lisbon for 2'.",
  "Skyguy converts every price into your home currency — no more mental yen-math.",
  "Heart a hotel and Skyguy will remember it across chats. Magic? No, Postgres.",
  "Settings → Travel preferences. Set your defaults once, never get asked twice.",
  "Skyguy's loading screen has rotated through ~80 facts. Did you read them all?",
  "If Skyguy ever apologises, blame Mistral. If it nails it, credit the engineer.",
];

export function TypingBubble({ lastUserMessage }: { lastUserMessage?: string }) {
  const kind = detectKind(lastUserMessage);
  const phases = PHASES[kind];
  const header = KIND_HEADER[kind];
  const isPolling = kind === "flights" || kind === "hotels";
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Pick a random starting fact so two consecutive waits don't feel identical.
  const [factIdx, setFactIdx] = useState(() => Math.floor(Math.random() * HACKUPC_FACTS.length));

  // Advance through phases — the last phase ("picking the best deals…") sticks
  // until the request actually returns.
  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, phases.length - 1));
    }, 3000);
    return () => clearInterval(id);
  }, [phases.length]);

  // Live elapsed timer — updates every 250ms.
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, []);

  // Asymptotic progress so it never lies about being done. Tuned to ~30s
  // typical Skyscanner completion window.
  const pct = Math.min(95, Math.round((1 - Math.exp(-elapsed / 12000)) * 100));

  // Rotate the fun fact every 6s.
  useEffect(() => {
    const id = setInterval(() => {
      setFactIdx((i) => (i + 1) % HACKUPC_FACTS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10">
        <SkyguyLogo className="h-5 w-5" />
      </div>
      <div className="min-w-[280px] max-w-md flex-1 rounded-2xl rounded-bl-md border border-border bg-card p-3 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            {isPolling && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {isPolling && <Radio className="h-3 w-3 text-primary" />}
              <span className="truncate">{header.label}</span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground">{header.sub}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            <Timer className="h-3 w-3" />
            {fmtElapsed(elapsed)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-sky transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Phase checklist */}
        <ul className="mt-2.5 space-y-1">
          {phases.map((p, i) => {
            const status: "done" | "active" | "upcoming" =
              i < phaseIdx ? "done" : i === phaseIdx ? "active" : "upcoming";
            const PhaseIcon = p.icon;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-2 text-[11px] transition-colors",
                  status === "done" && "text-muted-foreground",
                  status === "active" && "text-foreground",
                  status === "upcoming" && "text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    status === "done" && "bg-primary/15 text-primary",
                    status === "active" && "bg-primary text-primary-foreground",
                    status === "upcoming" && "bg-muted text-muted-foreground/60",
                  )}
                >
                  {status === "done" ? (
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  ) : status === "active" ? (
                    <PhaseIcon className="h-2.5 w-2.5 animate-pulse" />
                  ) : (
                    <PhaseIcon className="h-2.5 w-2.5" />
                  )}
                </span>
                <span className={cn("truncate", status === "active" && "font-medium")}>{p.label}</span>
                {status === "active" && (
                  <span className="ml-auto flex items-center gap-0.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* HackUPC fun-fact card — keeps the wait entertaining */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lightbulb className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              HackUPC fun fact
            </p>
            <p key={factIdx} className="mt-0.5 animate-fade-in-up text-[11px] leading-snug text-foreground">
              {HACKUPC_FACTS[factIdx]}
            </p>
          </div>
        </div>
        {isPolling && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Waiting longer usually surfaces cheaper prices ✨
          </p>
        )}
      </div>
    </div>
  );
}