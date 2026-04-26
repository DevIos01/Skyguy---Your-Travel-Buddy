import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Skyscanner Hotels Live Prices
// Docs: https://developers.skyscanner.net/docs/hotels-live-prices/quick-start
// Endpoints:
//   POST /apiservices/v1/hotels/live/search/create
//   POST /apiservices/v1/hotels/live/search/poll/{sessionToken}

function parseYmd(s: string): { year: number; month: number; day: number } | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const STAR_TO_NUM: Record<string, number> = {
  STARS_ONE_STAR: 1,
  STARS_TWO_STAR: 2,
  STARS_THREE_STAR: 3,
  STARS_FOUR_STAR: 4,
  STARS_FIVE_STAR: 5,
};

function starsFilterFor(minStars?: number): string[] | null {
  if (!minStars || minStars < 1) return null;
  const all = ["STARS_ONE_STAR", "STARS_TWO_STAR", "STARS_THREE_STAR", "STARS_FOUR_STAR", "STARS_FIVE_STAR"];
  return all.filter((k) => STAR_TO_NUM[k] >= Math.floor(minStars));
}

/**
 * Indicative Prices fallback. Returns a price-summary block (cheapest/avg/median + per-star
 * breakdown) instead of per-hotel cards. Used when Live Prices is not available on the API key
 * or returns no results.
 */
async function indicativeSearch(args: {
  apiKey: string;
  entityId: string;
  checkIn: { year: number; month: number; day: number };
  checkOut: { year: number; month: number; day: number };
  market: string;
  locale: string;
  currency: string;
  minStars?: number;
}): Promise<any | null> {
  const url = "https://partners.api.skyscanner.net/apiservices/v1/hotels/indicative/search";

  async function callFor(starFilterValues: string[] | null) {
    const body: any = {
      query: {
        market: args.market,
        locale: args.locale,
        currency: args.currency,
        destinationEntityIds: [String(args.entityId)],
        travelDate: {
          dateRange: {
            startDate: args.checkIn,
            endDate: args.checkOut,
          },
        },
        dateTimeGroupingType: "DATE_TIME_GROUPING_TYPE_AGGREGATED",
      },
    };
    if (starFilterValues && starFilterValues.length) {
      body.query.filter = { stars: { values: starFilterValues } };
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": args.apiKey },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error("indicative search error", resp.status, text.slice(0, 500));
      return null;
    }
    try { return JSON.parse(text); } catch { return null; }
  }

  // Aggregate (no star filter) for headline numbers
  const aggregate = await callFor(null);
  if (!aggregate) return null;

  // Pull cheapest/average/median from the aggregate response (shape: { prices: { <key>: { prices: [{aggregationType, price}] } } })
  function extract(resp: any): { cheapest?: number; average?: number; median?: number } {
    const out: { cheapest?: number; average?: number; median?: number } = {};
    const map = resp?.prices ?? {};
    for (const key of Object.keys(map)) {
      const arr = map[key]?.prices ?? [];
      for (const p of arr) {
        const t: string = p?.aggregationType ?? "";
        const v: number = Number(p?.price?.amount ?? p?.price ?? p?.value ?? 0);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (t.includes("CHEAPEST") && (out.cheapest === undefined || v < out.cheapest)) out.cheapest = v;
        else if (t.includes("AVERAGE") && out.average === undefined) out.average = v;
        else if (t.includes("MEDIAN") && out.median === undefined) out.median = v;
      }
    }
    return out;
  }

  const headline = extract(aggregate);

  // Per-star breakdown (best-effort) — call each star bucket the user cares about
  const starsToFetch = args.minStars
    ? Array.from({ length: 6 - Math.floor(args.minStars) }, (_, i) => Math.floor(args.minStars!) + i)
    : [3, 4, 5];
  const starsBreakdown: Array<{ stars: number; cheapest?: number; average?: number; median?: number }> = [];
  for (const s of starsToFetch) {
    const filter = starsFilterFor(s);
    if (!filter) continue;
    const resp = await callFor([filter[0]]); // exact star bucket
    if (!resp) continue;
    const agg = extract(resp);
    if (agg.cheapest || agg.average || agg.median) {
      starsBreakdown.push({ stars: s, ...agg });
    }
  }

  return { headline, starsBreakdown };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SKYSCANNER_API_KEY");
    if (!apiKey) throw new Error("SKYSCANNER_API_KEY is not configured");

    const {
      entityId,        // destination entityId from places autosuggest
      checkInDate,     // YYYY-MM-DD
      checkOutDate,    // YYYY-MM-DD
      adults = 2,
      rooms = 1,
      minStars,        // optional: filter to hotels with >= this many stars (1-5)
      minRating,       // optional: filter results client-side by guest rating (0-10 in Skyscanner)
      market = "UK",
      locale = "en-GB",
      currency = "EUR",
      destinationName, // optional pretty name for the summary card
    } = await req.json();

    if (!entityId || !checkInDate || !checkOutDate) {
      return new Response(JSON.stringify({ error: "entityId, checkInDate, checkOutDate required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkin = parseYmd(checkInDate);
    const checkout = parseYmd(checkOutDate);
    if (!checkin || !checkout) {
      return new Response(JSON.stringify({ error: "Dates must be YYYY-MM-DD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const createUrl = "https://partners.api.skyscanner.net/apiservices/v1/hotels/live/search/create";
    const pollUrlFor = (token: string) =>
      `https://partners.api.skyscanner.net/apiservices/v1/hotels/live/search/poll/${token}`;

    const createBody = {
      query: {
        market,
        locale,
        currency,
        entityId: String(entityId),
        checkinDate: checkin,
        checkoutDate: checkout,
        adults,
        rooms,
      },
      initialPageSize: 30,
    };

    const nights = Math.max(
      1,
      Math.round((Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86400000),
    );

    async function buildIndicativeFallback(reason: string) {
      console.log("skyscanner-hotels falling back to indicative", { reason });
      const ind = await indicativeSearch({
        apiKey: apiKey!,
        entityId: String(entityId),
        checkIn: checkin!,
        checkOut: checkout!,
        market,
        locale,
        currency,
        minStars,
      });
      if (!ind || (!ind.headline.cheapest && !ind.headline.average && !ind.headline.median && (!ind.starsBreakdown || ind.starsBreakdown.length === 0))) {
        return null;
      }
      return {
        summary: {
          destination: destinationName || `Entity ${entityId}`,
          checkInDate,
          checkOutDate,
          totalNights: nights,
          currency,
          cheapest: ind.headline.cheapest,
          average: ind.headline.average,
          median: ind.headline.median,
          starsBreakdown: ind.starsBreakdown,
          source: "indicative" as const,
          note: "Live per-hotel pricing isn't available on this API key — these are aggregated estimates. Click through to Skyscanner to book.",
        },
      };
    }

    const createResp = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(createBody),
    });

    const createText = await createResp.text();
    if (!createResp.ok) {
      console.error("skyscanner-hotels create error", createResp.status, createText.slice(0, 800));
      // 403 = key doesn't have Live Prices access. Fall back to indicative aggregates.
      if (createResp.status === 403) {
        const fallback = await buildIndicativeFallback("live_prices_403");
        if (fallback) {
          return new Response(JSON.stringify({ ...fallback, hotels: [], hotelCount: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ error: "Skyscanner error", status: createResp.status, body: createText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data = JSON.parse(createText);
    let status: string = data?.status ?? "UNKNOWN";
    const sessionToken: string | undefined = data?.sessionToken;
    console.log("skyscanner-hotels create ok", { status, hasToken: !!sessionToken });

    const starsValues = starsFilterFor(minStars);
    const pollFilters: any[] = [];
    if (starsValues && starsValues.length) pollFilters.push({ starsFilter: { values: starsValues } });
    const pollBody = {
      sort: { type: "SORT_ORDER_TYPE_PRICE", order: "SORT_ORDER_DIRECTION_ASCENDING" },
      pagination: { limit: 30, offset: 0 },
      ...(pollFilters.length ? { filters: pollFilters } : {}),
    };

    // Wait for the search to genuinely complete — Skyscanner streams cheaper
    // rates in late as more suppliers respond. The previous 6-poll / 20s cap
    // returned the more expensive first-wave prices.
    const MAX_POLLS = 16;
    const POLL_DELAY_MS = 1500;
    const MAX_WALL_MS = 50_000;
    let pollCount = 0;
    const startedAt = Date.now();

    while (
      sessionToken &&
      status !== "RESULT_STATUS_COMPLETE" &&
      pollCount < MAX_POLLS &&
      Date.now() - startedAt < MAX_WALL_MS
    ) {
      await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
      pollCount++;
      const pollResp = await fetch(pollUrlFor(sessionToken), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(pollBody),
      });
      const pollText = await pollResp.text();
      if (!pollResp.ok) {
        console.error("skyscanner-hotels poll error", pollResp.status, pollText.slice(0, 500));
        break;
      }
      data = JSON.parse(pollText);
      status = data?.status ?? status;
      const hotelCount = Object.keys(data?.content?.results?.hotels ?? {}).length;
      console.log("skyscanner-hotels poll", { pollCount, status, hotelCount });
      if (status === "RESULT_STATUS_COMPLETE") break;
    }

    console.log("skyscanner-hotels done", { status, pollCount, elapsedMs: Date.now() - startedAt });

    // Skyscanner v1 response shape:
    //   data.content.results.hotels           — map<hotelId, { distanceFromTarget, deeplink }>
    //   data.content.results.hotelContent     — map<hotelId, { hotelName, stars, hotelImages[], guestRating{score, reviewCount}, ... }>
    //   data.content.results.hotelsPricingOptions — map<hotelId, { price{currency, price}, deeplink, ... }>
    const hotelsMap: Record<string, any> = data?.content?.results?.hotels ?? {};
    const contentMap: Record<string, any> = data?.content?.results?.hotelContent ?? {};
    const pricingMap: Record<string, any> = data?.content?.results?.hotelsPricingOptions ?? {};

    const merged = Object.entries(hotelsMap).map(([hotelId, h]: [string, any]) => {
      const content = contentMap[hotelId] ?? {};
      // pricingMap can be keyed by pricing-option id; find the cheapest pricing option for this hotel
      const pricingOptions = Object.values(pricingMap).filter((p: any) => p?.hotelId === hotelId) as any[];
      const cheapest = pricingOptions
        .map((p) => ({ price: Number(p?.price?.price ?? 0), currency: p?.price?.currency ?? currency, deeplink: p?.deeplink }))
        .filter((p) => p.price > 0)
        .sort((a, b) => a.price - b.price)[0];

      const totalPrice = cheapest?.price ?? 0;
      const pricePerNight = totalPrice ? Math.round(totalPrice / nights) : 0;
      const starsNum = STAR_TO_NUM[content?.stars] ?? 0;
      const guest = content?.guestRating ?? {};
      const rating10 = Number(guest?.score ?? 0); // Skyscanner score is 0-10
      const rating5 = rating10 ? Math.round((rating10 / 2) * 10) / 10 : starsNum; // normalize to 0-5 for the UI
      const distanceMeters = Number(h?.distanceFromTarget?.value ?? 0);
      const distanceFromCenter = distanceMeters
        ? distanceMeters >= 1000
          ? `${(distanceMeters / 1000).toFixed(1)} km from center`
          : `${Math.round(distanceMeters)} m from center`
        : undefined;
      const image =
        content?.hotelImages?.[0]?.galleryUrl ??
        content?.hotelImages?.[0]?.fullUrl ??
        content?.hotelImages?.[0]?.thumbnailUrl ??
        "🏨";

      return {
        id: hotelId,
        name: content?.hotelName ?? "Hotel",
        area: "",
        rating: rating5,
        reviews: Number(guest?.reviewCount ?? 0),
        stars: starsNum,
        pricePerNight,
        totalPrice,
        currency: cheapest?.currency ?? currency,
        totalNights: nights,
        image,
        amenities: [],
        distanceFromCenter,
        deeplink: cheapest?.deeplink ?? h?.deeplink ?? "",
      };
    });

    // Apply optional client-side rating filter (in 0-5 scale)
    const filtered = merged
      .filter((h) => (typeof minRating === "number" ? h.rating >= minRating : true))
      .filter((h) => h.pricePerNight > 0)
      .sort((a, b) => a.pricePerNight - b.pricePerNight);

    const hotels = filtered.slice(0, 10).map((h, idx) => ({
      ...h,
      badge: idx === 0 ? "Best value" : idx === 1 ? "Top rated" : undefined,
    }));

    if (hotels.length === 0) {
      // Live Prices returned nothing — try indicative as a softer answer
      const fallback = await buildIndicativeFallback("live_prices_empty");
      if (fallback) {
        return new Response(JSON.stringify({ ...fallback, hotels: [], hotelCount: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      hotels,
      hotelCount: hotels.length,
      message: hotels.length === 0
        ? "Skyscanner returned no hotels for this query. Do NOT fabricate hotels — tell the user no live results were found and suggest different dates or destinations."
        : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hotels exception", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});