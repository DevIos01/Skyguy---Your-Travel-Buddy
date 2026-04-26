import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Skyscanner Flights Live Prices (Create Search)
// Docs: https://developers.skyscanner.net/docs/flights-live-prices/overview
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SKYSCANNER_API_KEY");
    if (!apiKey) throw new Error("SKYSCANNER_API_KEY is not configured");

    const {
      originEntityId,
      destinationEntityId,
      departureDate, // { year, month, day }
      returnDate,    // optional
      adults = 1,
      childrenAges = [], // array of ages, e.g. [4, 9]
      cabinClass = "CABIN_CLASS_ECONOMY",
      market = "UK",
      locale = "en-GB",
      currency = "EUR",
      // Stop filtering. `directOnly: true` forces 0-stop legs; otherwise
      // `maxStops` (0/1/2) caps the stop count per leg. Both are applied
      // POST-fetch — Skyscanner's create endpoint doesn't take a stop filter
      // in v3, so we filter the itineraries after the poll completes.
      directOnly = false,
      maxStops,
    } = await req.json();

    if (!originEntityId || !destinationEntityId || !departureDate) {
      return new Response(JSON.stringify({ error: "originEntityId, destinationEntityId, departureDate required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queryLegs = [
      {
        originPlaceId: { entityId: originEntityId },
        destinationPlaceId: { entityId: destinationEntityId },
        date: departureDate,
      },
    ];
    if (returnDate) {
      queryLegs.push({
        originPlaceId: { entityId: destinationEntityId },
        destinationPlaceId: { entityId: originEntityId },
        date: returnDate,
      });
    }

    const createUrl = "https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create";
    const pollUrlFor = (token: string) =>
      `https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/poll/${token}`;

    const createResp = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: {
          market,
          locale,
          currency,
          adults,
          ...(Array.isArray(childrenAges) && childrenAges.length ? { childrenAges } : {}),
          cabinClass,
          queryLegs,
        },
      }),
    });

    const createText = await createResp.text();
    if (!createResp.ok) {
      console.error("skyscanner-flights create error", createResp.status, createText);
      // Skyscanner rejects non-CITY/AIRPORT entity IDs with this exact text.
      // Surface a clean, actionable message so the model retries `search_places`
      // and picks a different (CITY/AIRPORT) entityId instead of giving up.
      const isBadEntity = /QueryPlace ID is not valid entity ID/i.test(createText);
      return new Response(JSON.stringify({
        error: isBadEntity ? "INVALID_ENTITY_ID" : "Skyscanner error",
        status: createResp.status,
        body: createText,
        message: isBadEntity
          ? "Skyscanner rejected one of the entity IDs. Re-run search_places for the origin and destination, then pick a result whose `type` is `PLACE_TYPE_CITY` or `PLACE_TYPE_AIRPORT` (NOT country/region/neighborhood). Do NOT give up — retry the search with the correct entityIds."
          : undefined,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data = JSON.parse(createText);
    let status: string = data?.status ?? data?.content?.status ?? "UNKNOWN";
    const sessionToken: string | undefined = data?.sessionToken ?? data?.content?.sessionToken;

    // Poll until COMPLETE — but cap the wall time aggressively. The 2-min
    // chat round trips were almost entirely spent here waiting for "the
    // last 5%" of suppliers. After ~25s we already have 1000+ itineraries,
    // and the cheapest fare is virtually always in the first wave.
    const MAX_POLLS = 10;
    const POLL_DELAY_MS = 1500;
    const MAX_WALL_MS = 25_000;
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
        body: JSON.stringify({}),
      });
      const pollText = await pollResp.text();
      if (!pollResp.ok) {
        console.error("skyscanner-flights poll error", pollResp.status, pollText.slice(0, 500));
        break;
      }
      data = JSON.parse(pollText);
      status = data?.status ?? data?.content?.status ?? status;
      const itinCount = Object.keys(data?.content?.results?.itineraries ?? {}).length;
      console.log("skyscanner-flights poll", { pollCount, status, itinCount });
      // Only exit early when the search is truly COMPLETE — itinerary count
      // alone isn't a reliable signal because cheaper offers stream in late.
      if (status === "RESULT_STATUS_COMPLETE") break;
    }

    const itineraries = data?.content?.results?.itineraries ?? {};
    const legs = data?.content?.results?.legs ?? {};
    const carriers = data?.content?.results?.carriers ?? {};
    const places = data?.content?.results?.places ?? {};

    console.log("skyscanner-flights done", {
      status,
      pollCount,
      itineraryCount: Object.keys(itineraries).length,
      legCount: Object.keys(legs).length,
      elapsedMs: Date.now() - startedAt,
    });

    const fmtTime = (iso: any) => {
      if (!iso) return "—";
      // Skyscanner returns objects: { year, month, day, hour, minute, second }
      if (typeof iso === "object" && iso.hour !== undefined) {
        return `${String(iso.hour).padStart(2, "0")}:${String(iso.minute).padStart(2, "0")}`;
      }
      const d = new Date(iso);
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    };
    const fmtDate = (iso: any) => {
      const d = typeof iso === "object" && iso.year
        ? new Date(Date.UTC(iso.year, (iso.month ?? 1) - 1, iso.day ?? 1))
        : new Date(iso);
      return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
    };
    const fmtIsoDate = (iso: any): string => {
      const d = typeof iso === "object" && iso.year
        ? new Date(Date.UTC(iso.year, (iso.month ?? 1) - 1, iso.day ?? 1))
        : new Date(iso);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    };

    /**
     * Convert a Skyscanner price object → a plain number in the currency's
     * whole units (e.g. USD dollars). Skyscanner returns `amount` as a string
     * and a `unit` enum that is the divisor: WHOLE=1, CENTI=100, MILLI=1000,
     * MICRO=1_000_000. Hardcoding /1000 was wrong for many results.
     */
    const priceToNumber = (priceObj: any): number | null => {
      if (!priceObj) return null;
      const amount = Number(priceObj.amount);
      if (!Number.isFinite(amount)) return null;
      const divisor =
        priceObj.unit === "PRICE_UNIT_WHOLE" ? 1 :
        priceObj.unit === "PRICE_UNIT_CENTI" ? 100 :
        priceObj.unit === "PRICE_UNIT_MICRO" ? 1_000_000 :
        1000; // default to MILLI — matches Skyscanner's most common payload
      return amount / divisor;
    };

    const buildSegment = (leg: any) => {
      const origin = places[leg.originPlaceId];
      const destination = places[leg.destinationPlaceId];
      const carrier = carriers[leg.marketingCarrierIds?.[0]];
      return {
        airline: carrier?.name ?? "Airline",
        airlineCode: carrier?.iata ?? "—",
        flightNumber: leg.flightNumbers?.[0]?.flightNumber ? `${carrier?.iata ?? ""}${leg.flightNumbers[0].flightNumber}` : "",
        from: { city: origin?.name ?? "", code: origin?.iata ?? "—", time: fmtTime(leg.departureDateTime), date: fmtDate(leg.departureDateTime), isoDate: fmtIsoDate(leg.departureDateTime) },
        to: { city: destination?.name ?? "", code: destination?.iata ?? "—", time: fmtTime(leg.arrivalDateTime), date: fmtDate(leg.arrivalDateTime), isoDate: fmtIsoDate(leg.arrivalDateTime) },
        durationMin: leg.durationInMinutes ?? 0,
        stops: leg.stopCount ?? 0,
      };
    };

    const effectiveMaxStops = directOnly
      ? 0
      : (typeof maxStops === "number" && maxStops >= 0 ? maxStops : null);

    const offersRaw = Object.entries(itineraries)
      .map(([itinId, itin]: [string, any]) => {
        // PRICE SOURCE OF TRUTH:
        // Skyscanner v3 gives several pricing fields and they don't all mean the same thing.
        //  - `pricingOptions[].price` for SINGLE-AGENT options is the total trip price for
        //    all passengers in the query.
        //  - For SELF-TRANSFER / MULTI-AGENT options, Skyscanner stitches multiple agents
        //    together and the `price` is the SUM of per-agent prices — and each agent's
        //    price is sometimes already per-passenger, sometimes per-leg, leading to
        //    inflated totals (we were seeing 5x the real fare for 2-stop self-transfer
        //    itineraries — e.g. €10,466 instead of the €2,071 shown on Skyscanner.com).
        //
        // The reliable headline figure is the per-itinerary `price` rollup that Skyscanner
        // computes itself (same number you see on skyscanner.com). We use that, and only
        // fall back to single-agent pricingOptions if it's missing.
        const itinPrice = priceToNumber(itin?.price);
        const singleAgentOptions = (itin.pricingOptions ?? [])
          .filter((po: any) => (po?.agentIds?.length ?? 0) <= 1)
          .map((po: any) => ({ po, value: priceToNumber(po?.price) }))
          .filter((x: any) => x.value !== null && x.value > 0)
          .sort((a: any, b: any) => a.value - b.value);
        const totalPrice = itinPrice ?? singleAgentOptions[0]?.value ?? null;
        const price = totalPrice !== null ? Math.round(totalPrice) : null;
        const legIds: string[] = itin.legIds ?? [];
        const outboundLeg = legs[legIds[0]];
        const returnLeg = legIds[1] ? legs[legIds[1]] : null;
        if (!outboundLeg) return null;
        // Apply stop filter per leg.
        if (effectiveMaxStops !== null) {
          const outStops = outboundLeg.stopCount ?? 0;
          const retStops = returnLeg ? (returnLeg.stopCount ?? 0) : 0;
          if (outStops > effectiveMaxStops || retStops > effectiveMaxStops) return null;
        }
        return {
          id: itinId,
          price,
          // Per-traveller price so the UI can label it correctly.
          // adults + childrenAges.length is the total head count Skyscanner priced.
          pricePerPerson: price !== null
            ? Math.round(price / Math.max(1, adults + (childrenAges?.length ?? 0)))
            : null,
          adults,
          childrenCount: childrenAges?.length ?? 0,
          currency,
          cabin: cabinClass.replace("CABIN_CLASS_", "").toLowerCase(),
          bagsIncluded: 0,
          refundable: false,
          outbound: buildSegment(outboundLeg),
          return: returnLeg ? buildSegment(returnLeg) : undefined,
        };
      })
      .filter((o) => o && o.price !== null)
      .sort((a: any, b: any) => a.price - b.price);

    // Tag the cheapest AFTER filtering (otherwise the badge could vanish
    // when stop filters drop the original #1).
    const offers = offersRaw.slice(0, 8).map((o: any, idx: number) => ({
      ...o,
      badge: idx === 0 ? "Cheapest" : undefined,
    }));

    return new Response(JSON.stringify({
      offers,
      offerCount: offers.length,
      searchStatus: status,
      filters: { directOnly, maxStops: effectiveMaxStops },
      message: offers.length === 0
        ? (effectiveMaxStops === 0
            ? "Skyscanner returned no DIRECT itineraries for this query. Do NOT fabricate flights — tell the user no direct flights were found and offer to retry allowing 1 stop."
            : "Skyscanner returned no itineraries for this query. Do NOT fabricate flights — tell the user no live results were found and suggest different dates or routes.")
        : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("flights exception", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});