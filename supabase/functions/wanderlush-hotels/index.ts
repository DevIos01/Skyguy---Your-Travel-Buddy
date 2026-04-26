import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Wanderlush Stays — mock hotel search.
 * Mirrors the Skyscanner contract used by travel-chat:
 *   - Input: city/area + dates + adults/rooms + minStars/minRating
 *   - Output: { hotels: HotelOffer[], hotelCount }
 *
 * Pricing is computed from the per-date hotel_availability table for the requested
 * range so dates actually affect prices and availability (just like a real provider).
 */

function parseYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = await req.json();
    const {
      city,                 // human destination ("Tokyo", "Paris")
      area,                 // optional ("Shinjuku")
      checkInDate,          // YYYY-MM-DD
      checkOutDate,         // YYYY-MM-DD
      adults = 2,
      rooms = 1,
      minStars,             // 1..5
      minRating,            // 0..5 (guest)
      currency = "EUR",
      limit = 10,
    } = body ?? {};

    if (!city || !checkInDate || !checkOutDate) {
      return new Response(JSON.stringify({ error: "city, checkInDate, checkOutDate required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!parseYmd(checkInDate) || !parseYmd(checkOutDate)) {
      return new Response(JSON.stringify({ error: "Dates must be YYYY-MM-DD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nights = Math.max(
      1,
      Math.round((Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86400000),
    );

    // Range is [checkIn, checkOut) — the night of checkOut is not stayed.
    const startStr = checkInDate;
    const endStr = new Date(Date.parse(checkOutDate) - 86400000).toISOString().slice(0, 10);

    // 1. Find candidate hotels in the city (case-insensitive). Optional area + star filter.
    let q = admin.from("hotels")
      .select("id, name, brand, city, country, area, stars, rating, reviews_count, amenities, image_url, currency, description")
      .ilike("city", city);
    if (area) q = q.ilike("area", `%${area}%`);
    if (typeof minStars === "number") q = q.gte("stars", Math.floor(minStars));
    if (typeof minRating === "number") q = q.gte("rating", minRating);

    const { data: hotels, error: hotelsErr } = await q;
    if (hotelsErr) throw hotelsErr;

    if (!hotels || hotels.length === 0) {
      return new Response(JSON.stringify({
        hotels: [],
        hotelCount: 0,
        brand: "Wanderlush Stays",
        message: `Wanderlush Stays has no properties matching ${city}${area ? ` / ${area}` : ""}. Try another city or relax the filters.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Pull availability for those hotels across the date range
    const hotelIds = hotels.map((h) => h.id);
    const { data: availRows, error: availErr } = await admin
      .from("hotel_availability")
      .select("hotel_id, date, rooms_available, price_per_night")
      .in("hotel_id", hotelIds)
      .gte("date", startStr)
      .lte("date", endStr);
    if (availErr) throw availErr;

    const byHotel = new Map<string, { totalPrice: number; nightsCovered: number; minRooms: number }>();
    for (const row of availRows ?? []) {
      const cur = byHotel.get(row.hotel_id) ?? { totalPrice: 0, nightsCovered: 0, minRooms: Infinity };
      cur.totalPrice += Number(row.price_per_night);
      cur.nightsCovered += 1;
      cur.minRooms = Math.min(cur.minRooms, Number(row.rooms_available));
      byHotel.set(row.hotel_id, cur);
    }

    // 3. Build offers — only include hotels that have full coverage AND >= rooms available every night
    const offers = hotels
      .map((h) => {
        const a = byHotel.get(h.id);
        if (!a || a.nightsCovered < nights) return null;
        if (a.minRooms < rooms) return null;
        const totalPrice = Math.round(a.totalPrice * 100) / 100;
        const pricePerNight = Math.round((totalPrice / nights) * 100) / 100;
        return {
          id: h.id,
          name: h.name,
          area: h.area ?? "",
          rating: Number(h.rating),
          reviews: h.reviews_count,
          stars: h.stars,
          pricePerNight,
          totalPrice,
          currency: h.currency || currency,
          totalNights: nights,
          image: h.image_url || "🏨",
          amenities: h.amenities ?? [],
          distanceFromCenter: undefined,
          deeplink: "",
          brand: h.brand,
          description: h.description,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .sort((a, b) => a.pricePerNight - b.pricePerNight);

    const top = offers.slice(0, limit).map((o, idx) => ({
      ...o,
      badge:
        idx === 0 ? "Best value" :
        offers.find((x) => x.id === o.id) && o.rating >= 4.7 ? "Top rated" :
        undefined,
    }));

    return new Response(JSON.stringify({
      hotels: top,
      hotelCount: top.length,
      brand: "Wanderlush Stays",
      tagline: "Sleep is a strategy.",
      message: top.length === 0
        ? `Wanderlush Stays has properties in ${city} but none match your dates/filters. Try other dates or lower minStars/minRating.`
        : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("wanderlush-hotels error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
