import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Wanderlush Wheels — mock car-rental search.
 * Input:  city + pickup/return dates + optional vehicleClass / transmission / minSeats / minSupplierRating
 * Output: { cars: CarOffer[], carCount }
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
      city,                  // pickup city
      pickupDate,            // YYYY-MM-DD
      returnDate,            // YYYY-MM-DD
      vehicleClass,          // optional: "economy", "compact", "intermediate", "suv", "luxury", "minivan", "fullsize-suv", "kei"
      transmission,          // optional: "automatic" | "manual"
      minSeats,              // optional
      minSupplierRating,     // optional 0..5
      currency = "EUR",
      limit = 10,
    } = body ?? {};

    if (!city || !pickupDate || !returnDate) {
      return new Response(JSON.stringify({ error: "city, pickupDate, returnDate required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!parseYmd(pickupDate) || !parseYmd(returnDate)) {
      return new Response(JSON.stringify({ error: "Dates must be YYYY-MM-DD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const days = Math.max(
      1,
      Math.round((Date.parse(returnDate) - Date.parse(pickupDate)) / 86400000),
    );

    const startStr = pickupDate;
    // Cars are charged per day inclusive of pickupDate up to (returnDate - 1 day) for our seed,
    // but practically we want `days` rows per car so just use [pickup, pickup+days).
    const endStr = new Date(Date.parse(pickupDate) + (days - 1) * 86400000).toISOString().slice(0, 10);

    let q = admin.from("rental_cars")
      .select("id, name, brand, vehicle_class, transmission, seats, doors, bags, image_url, features, pickup_city, pickup_country, pickup_location_name, supplier, supplier_rating, currency")
      .ilike("pickup_city", city);
    if (vehicleClass) q = q.eq("vehicle_class", vehicleClass);
    if (transmission) q = q.eq("transmission", transmission);
    if (typeof minSeats === "number") q = q.gte("seats", minSeats);
    if (typeof minSupplierRating === "number") q = q.gte("supplier_rating", minSupplierRating);

    const { data: cars, error: carsErr } = await q;
    if (carsErr) throw carsErr;

    if (!cars || cars.length === 0) {
      return new Response(JSON.stringify({
        cars: [],
        carCount: 0,
        brand: "Wanderlush Wheels",
        message: `Wanderlush Wheels has nothing matching ${city}. Try a different city or relax filters.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const carIds = cars.map((c) => c.id);
    const { data: availRows, error: availErr } = await admin
      .from("rental_car_availability")
      .select("car_id, date, units_available, price_per_day")
      .in("car_id", carIds)
      .gte("date", startStr)
      .lte("date", endStr);
    if (availErr) throw availErr;

    const byCar = new Map<string, { totalPrice: number; daysCovered: number; minUnits: number }>();
    for (const r of availRows ?? []) {
      const cur = byCar.get(r.car_id) ?? { totalPrice: 0, daysCovered: 0, minUnits: Infinity };
      cur.totalPrice += Number(r.price_per_day);
      cur.daysCovered += 1;
      cur.minUnits = Math.min(cur.minUnits, Number(r.units_available));
      byCar.set(r.car_id, cur);
    }

    const offers = cars
      .map((c) => {
        const a = byCar.get(c.id);
        if (!a || a.daysCovered < days) return null;
        if (a.minUnits < 1) return null;
        const totalPrice = Math.round(a.totalPrice * 100) / 100;
        const pricePerDay = Math.round((totalPrice / days) * 100) / 100;
        return {
          id: c.id,
          name: c.name,
          brand: c.brand,
          vehicleClass: c.vehicle_class,
          transmission: c.transmission,
          seats: c.seats,
          doors: c.doors,
          bags: c.bags,
          features: c.features ?? [],
          image: c.image_url || "🚗",
          pickupCity: c.pickup_city,
          pickupCountry: c.pickup_country,
          pickupLocationName: c.pickup_location_name,
          supplier: c.supplier,
          supplierRating: Number(c.supplier_rating),
          pricePerDay,
          totalPrice,
          totalDays: days,
          currency: c.currency || currency,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .sort((a, b) => a.pricePerDay - b.pricePerDay);

    const top = offers.slice(0, limit).map((o, idx) => ({
      ...o,
      badge: idx === 0 ? "Cheapest" : o.supplierRating >= 4.7 ? "Top rated" : undefined,
    }));

    return new Response(JSON.stringify({
      cars: top,
      carCount: top.length,
      brand: "Wanderlush Wheels",
      tagline: "From A to B, with extra legroom for snacks.",
      message: top.length === 0
        ? `Wanderlush Wheels has cars in ${city} but none match your dates/filters.`
        : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("wanderlush-cars error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
