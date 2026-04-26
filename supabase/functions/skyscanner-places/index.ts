import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Skyscanner Autosuggest (places) — partner endpoint
// Docs: https://developers.skyscanner.net/docs/autosuggest/overview
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SKYSCANNER_API_KEY");
    if (!apiKey) throw new Error("SKYSCANNER_API_KEY is not configured");

    const { query, locale = "en-GB", market = "UK" } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = "https://partners.api.skyscanner.net/apiservices/v3/autosuggest/flights";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: { market, locale, searchTerm: query },
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("skyscanner-places error", resp.status, text);
      return new Response(JSON.stringify({ error: "Skyscanner error", status: resp.status, body: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = JSON.parse(text);
    // Skyscanner autosuggest is a fuzzy-match — for "Hamburg" it can return
    // Ilorin (ILR, Nigeria), countries, regions, or random regional airports
    // above the actual Hamburg city/airport entry. The Mistral model has been
    // blindly picking whichever entry happens to come first, which produces
    // nonsense flights (e.g. "Hamburg → Tokyo" routed from ILR) and 400s
    // ("The QueryPlace ID is not valid entity ID") when the picked entity is
    // a country/region/neighborhood — the Flights Live Prices API only
    // accepts CITY or AIRPORT entityIds.
    //
    // So we (a) HARD-FILTER to CITY/AIRPORT only, and (b) rank so the obvious
    // match comes first:
    //   1. Exact name match (case-insensitive) on the user's query.
    //   2. Name STARTS WITH the user's query (e.g. "Hamburg Airport").
    //   3. Cities (PLACE_TYPE_CITY) before airports — a city entityId covers
    //      every airport in the metro area, which is what the user almost
    //      always wants when they type a city name.
    //   4. Skyscanner's original ordering as the final tiebreaker.
    const ALLOWED_TYPES = new Set(["PLACE_TYPE_CITY", "PLACE_TYPE_AIRPORT"]);
    const q = query.trim().toLowerCase();
    const score = (p: any): number => {
      const name = (p?.name ?? "").toLowerCase();
      let s = 0;
      if (name === q) s += 100;
      else if (name.startsWith(q)) s += 50;
      else if (name.includes(q)) s += 10;
      if (p?.type === "PLACE_TYPE_CITY") s += 30;
      if (p?.type === "PLACE_TYPE_AIRPORT") s += 5;
      return s;
    };
    const ranked = [...(data?.places ?? [])]
      .filter((p: any) => ALLOWED_TYPES.has(p?.type))
      .map((p: any, idx: number) => ({ p, s: score(p), idx }))
      .sort((a, b) => b.s - a.s || a.idx - b.idx)
      .map(({ p }) => p);
    const places = ranked.slice(0, 10).map((p: any) => ({
      entityId: p.entityId,
      iataCode: p.iataCode,
      name: p.name,
      hierarchy: p.hierarchy,
      type: p.type,
    }));

    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("places exception", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});