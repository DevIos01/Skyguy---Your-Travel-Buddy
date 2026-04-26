import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { CITIES, type CityTuple } from "./cities.ts";

/**
 * Wanderlush Holdings™ massive seeder.
 * - Procedurally generates ~5,000 hotels and ~2,800 cars across ~700 real cities.
 * - Builds 45 days of forward availability with light price seasonality.
 * - Realistic-sounding names, brands, suppliers (no quirky "Lush" stuff).
 *
 * Query params:
 *   ?force=1            wipe & reseed catalog
 *   ?days=N             availability window (15..120, default 45)
 *   ?skipAvailability=1 only seed catalog, no availability rows
 */

type HotelSeed = {
  name: string;
  city: string;
  country: string;
  area: string;
  latitude: number;
  longitude: number;
  stars: 1 | 2 | 3 | 4 | 5;
  rating: number;
  reviews_count: number;
  amenities: string[];
  image_url: string;
  base_price_per_night: number;
  currency: string;
  description: string;
};

type CarSeed = {
  name: string;
  vehicle_class: string;
  transmission: "automatic" | "manual";
  seats: number;
  doors: number;
  bags: number;
  features: string[];
  image_url: string;
  pickup_city: string;
  pickup_country: string;
  pickup_location_name: string;
  latitude: number;
  longitude: number;
  supplier: string;
  supplier_rating: number;
  base_price_per_day: number;
  currency: string;
};

// ============================================================
// REGIONAL FLAVOR — names, suppliers, car makes, hotel images
// ============================================================

const HOTEL_BRAND_PREFIXES = [
  "Grand", "Royal", "Plaza", "Imperial", "Park", "Garden", "Riverside",
  "Harbor", "Central", "Heritage", "Continental", "Metropolitan", "Boulevard",
  "Old Town", "Downtown", "Sunset", "Sunrise", "Marina", "Skyline",
  "Cosmopolitan", "Bayview", "Hilltop", "Lakeside", "Cityview", "Avenue",
  "Mariner's", "Cathedral", "Opera", "Cultura", "Atelier", "Quarter",
  "Galaxy", "Aurora", "Beacon", "Lantern", "Crown", "Diamond", "Saffron",
  "Verde", "Azur", "Soleil", "Lumen", "Prima", "Quay", "Promenade",
  "Cloister", "Belvedere", "Aria", "Solace", "Wanderer's", "Voyager",
];
const HOTEL_BRAND_SUFFIXES = [
  "Hotel", "Inn", "Suites", "Residences", "Lodge", "House", "Boutique Hotel",
  "Palace Hotel", "Resort", "Apartments", "Loft", "Hideaway", "Retreat",
  "Collection", "Studios", "Quarters", "Mansion", "Tower", "Manor",
  "Aparthotel", "Stay", "Auberge", "Pension", "Guesthouse", "Hostal",
  "Suites & Spa", "Hotel & Spa", "Garden Hotel", "City Hotel",
];

// 14 stock travel images (Unsplash hotel/interior shots) — cycled deterministically
const HOTEL_IMAGES = [
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
  "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800",
  "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800",
  "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800",
  "https://images.unsplash.com/photo-1551776235-dde6d4829808?w=800",
  "https://images.unsplash.com/photo-1561501900-3701fa6a0864?w=800",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800",
  "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800",
  "https://images.unsplash.com/photo-1551918120-9739cb430c6d?w=800",
  "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800",
  "https://images.unsplash.com/photo-1513735492246-483525079686?w=800",
];

const CAR_IMAGES = [
  "https://images.unsplash.com/photo-1549924231-f129b911e442?w=800",
  "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800",
  "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800",
  "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
];

// Real-world rental suppliers
const CAR_SUPPLIERS = [
  { name: "Hertz", rating: 4.4 },
  { name: "Avis", rating: 4.3 },
  { name: "Europcar", rating: 4.2 },
  { name: "Enterprise", rating: 4.6 },
  { name: "Sixt", rating: 4.4 },
  { name: "Budget", rating: 4.1 },
  { name: "Alamo", rating: 4.3 },
  { name: "National", rating: 4.5 },
  { name: "Thrifty", rating: 4.0 },
  { name: "Dollar", rating: 4.1 },
  { name: "Goldcar", rating: 3.9 },
  { name: "Centauro", rating: 4.0 },
  { name: "OK Mobility", rating: 4.2 },
  { name: "Keddy by Europcar", rating: 4.1 },
  { name: "Firefly", rating: 3.8 },
  { name: "Green Motion", rating: 4.0 },
  { name: "InterRent", rating: 4.0 },
  { name: "Rent-A-Wreck", rating: 3.9 },
  { name: "Fox Rent A Car", rating: 4.0 },
  { name: "Payless", rating: 3.9 },
  { name: "Toyota Rent a Car", rating: 4.5 },
  { name: "Times Car Rental", rating: 4.4 },
  { name: "Nippon Rent-A-Car", rating: 4.4 },
  { name: "Localiza", rating: 4.3 },
  { name: "Movida", rating: 4.2 },
];

// Country code -> typical car makes/models. Each entry: [name, class, transmission, seats, doors, bags]
type CarTemplate = [string, string, "automatic" | "manual", number, number, number];
const CAR_TEMPLATES_BY_REGION: Record<string, CarTemplate[]> = {
  // Europe defaults: small, mostly manual
  EU: [
    ["Volkswagen Polo", "compact", "manual", 5, 5, 2],
    ["Renault Clio", "compact", "manual", 5, 5, 2],
    ["Peugeot 208", "compact", "manual", 5, 5, 2],
    ["Fiat 500", "economy", "manual", 4, 3, 1],
    ["Volkswagen Golf", "intermediate", "automatic", 5, 5, 3],
    ["Skoda Octavia", "intermediate", "automatic", 5, 5, 3],
    ["Ford Focus", "intermediate", "manual", 5, 5, 3],
    ["BMW 3 Series", "luxury", "automatic", 5, 4, 3],
    ["Mercedes-Benz C-Class", "luxury", "automatic", 5, 4, 3],
    ["Audi A4", "luxury", "automatic", 5, 4, 3],
    ["Volvo XC60", "suv", "automatic", 5, 5, 4],
    ["Peugeot 3008", "suv", "automatic", 5, 5, 4],
    ["Volkswagen Tiguan", "suv", "automatic", 5, 5, 4],
    ["Opel Vivaro", "minivan", "manual", 9, 5, 5],
    ["Tesla Model 3", "luxury", "automatic", 5, 4, 3],
  ],
  // North America defaults: bigger, automatic
  NA: [
    ["Nissan Versa", "economy", "automatic", 5, 4, 2],
    ["Hyundai Accent", "economy", "automatic", 5, 4, 2],
    ["Toyota Corolla", "compact", "automatic", 5, 4, 2],
    ["Honda Civic", "compact", "automatic", 5, 4, 2],
    ["Toyota Camry", "intermediate", "automatic", 5, 4, 3],
    ["Honda Accord", "intermediate", "automatic", 5, 4, 3],
    ["Ford Mustang", "luxury", "automatic", 4, 2, 2],
    ["Cadillac CT5", "luxury", "automatic", 5, 4, 3],
    ["Tesla Model 3", "luxury", "automatic", 5, 4, 3],
    ["Jeep Grand Cherokee", "suv", "automatic", 5, 5, 4],
    ["Ford Explorer", "suv", "automatic", 7, 5, 4],
    ["Chevrolet Tahoe", "fullsize-suv", "automatic", 8, 5, 5],
    ["Toyota Sienna", "minivan", "automatic", 8, 5, 5],
    ["Chrysler Pacifica", "minivan", "automatic", 7, 5, 5],
    ["Ford F-150", "fullsize-suv", "automatic", 5, 4, 4],
  ],
  // Japan / Korea: kei + Asian makes
  JP: [
    ["Toyota Aqua Hybrid", "compact", "automatic", 5, 4, 2],
    ["Toyota Yaris", "compact", "automatic", 5, 4, 2],
    ["Suzuki Hustler", "kei", "automatic", 4, 5, 1],
    ["Daihatsu Move", "kei", "automatic", 4, 5, 1],
    ["Honda Fit", "compact", "automatic", 5, 5, 2],
    ["Nissan Note e-Power", "intermediate", "automatic", 5, 5, 3],
    ["Toyota Camry", "intermediate", "automatic", 5, 4, 3],
    ["Lexus ES 300h", "luxury", "automatic", 5, 4, 3],
    ["Toyota Alphard", "minivan", "automatic", 7, 5, 5],
    ["Mazda CX-5", "suv", "automatic", 5, 5, 4],
  ],
  // SE Asia / India: small + scooter-friendly cars
  SEA: [
    ["Toyota Vios", "compact", "automatic", 5, 4, 2],
    ["Honda City", "compact", "automatic", 5, 4, 2],
    ["Suzuki Swift", "economy", "manual", 5, 5, 1],
    ["Toyota Innova", "minivan", "automatic", 7, 5, 4],
    ["Hyundai Creta", "suv", "automatic", 5, 5, 3],
    ["Mahindra Scorpio", "suv", "manual", 7, 5, 4],
    ["Toyota Fortuner", "suv", "automatic", 7, 5, 4],
    ["BMW 3 Series", "luxury", "automatic", 5, 4, 3],
    ["Maruti Swift", "economy", "manual", 5, 5, 1],
  ],
  // Latin America
  LA: [
    ["Chevrolet Onix", "economy", "manual", 5, 4, 2],
    ["Volkswagen Gol", "economy", "manual", 5, 4, 2],
    ["Renault Sandero", "compact", "manual", 5, 5, 2],
    ["Fiat Cronos", "compact", "manual", 5, 4, 2],
    ["Toyota Corolla", "intermediate", "automatic", 5, 4, 3],
    ["Toyota Hilux", "fullsize-suv", "manual", 5, 4, 4],
    ["Jeep Renegade", "suv", "automatic", 5, 5, 3],
    ["Volkswagen T-Cross", "suv", "automatic", 5, 5, 3],
  ],
  // Africa
  AF: [
    ["Toyota Corolla", "compact", "manual", 5, 4, 2],
    ["Volkswagen Polo Vivo", "economy", "manual", 5, 5, 2],
    ["Toyota Hilux", "fullsize-suv", "manual", 5, 4, 4],
    ["Toyota Land Cruiser", "fullsize-suv", "automatic", 7, 5, 5],
    ["Nissan Navara", "fullsize-suv", "manual", 5, 4, 4],
    ["Hyundai Tucson", "suv", "automatic", 5, 5, 3],
    ["Suzuki Jimny", "suv", "manual", 4, 3, 2],
  ],
  // Middle East / Gulf
  ME: [
    ["Nissan Sunny", "economy", "automatic", 5, 4, 2],
    ["Toyota Corolla", "compact", "automatic", 5, 4, 2],
    ["Toyota Camry", "intermediate", "automatic", 5, 4, 3],
    ["Nissan Patrol", "fullsize-suv", "automatic", 7, 5, 5],
    ["Toyota Land Cruiser", "fullsize-suv", "automatic", 7, 5, 5],
    ["BMW 5 Series", "luxury", "automatic", 5, 4, 3],
    ["Mercedes-Benz E-Class", "luxury", "automatic", 5, 4, 3],
    ["Range Rover Sport", "suv", "automatic", 5, 5, 4],
  ],
  // Oceania
  OC: [
    ["Toyota Corolla", "compact", "automatic", 5, 4, 2],
    ["Mazda 3", "compact", "automatic", 5, 5, 2],
    ["Hyundai i30", "compact", "automatic", 5, 5, 2],
    ["Toyota Camry", "intermediate", "automatic", 5, 4, 3],
    ["Toyota RAV4", "suv", "automatic", 5, 5, 3],
    ["Mazda CX-5", "suv", "automatic", 5, 5, 3],
    ["Toyota HiAce", "minivan", "automatic", 9, 5, 5],
    ["Toyota LandCruiser", "fullsize-suv", "automatic", 7, 5, 5],
    ["Ford Ranger", "fullsize-suv", "automatic", 5, 4, 4],
  ],
};

const NA_COUNTRIES = new Set(["US", "CA"]);
const EU_COUNTRIES = new Set([
  "GB", "IE", "FR", "ES", "PT", "IT", "DE", "AT", "CH", "NL", "BE", "LU",
  "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "HU", "RO", "BG", "GR", "HR",
  "SI", "RS", "BA", "MK", "AL", "ME", "MT", "CY", "EE", "LV", "LT", "RU",
  "UA", "BY", "GE", "AM", "AZ",
]);
const JP_COUNTRIES = new Set(["JP", "KR", "TW", "HK", "MO"]);
const SEA_COUNTRIES = new Set([
  "CN", "ID", "MY", "PH", "TH", "VN", "KH", "LA", "MM", "SG", "BN", "TL",
  "IN", "NP", "BT", "LK", "MV", "PK", "BD", "AF", "MN", "KZ", "UZ", "KG",
  "TJ", "TM",
]);
const ME_COUNTRIES = new Set(["AE", "QA", "BH", "KW", "OM", "SA", "IL", "JO", "LB", "IR", "IQ", "TR"]);
const AF_COUNTRIES = new Set([
  "EG", "MA", "TN", "DZ", "LY", "ZA", "KE", "TZ", "UG", "RW", "ET", "NG",
  "GH", "SN", "CI", "ZW", "ZM", "MZ", "NA", "BW", "MG", "MU", "SC",
]);
const OC_COUNTRIES = new Set(["AU", "NZ", "FJ", "WS", "TO", "VU", "SB", "PG", "PF"]);

function regionForCountry(code: string): keyof typeof CAR_TEMPLATES_BY_REGION {
  if (NA_COUNTRIES.has(code)) return "NA";
  if (EU_COUNTRIES.has(code)) return "EU";
  if (JP_COUNTRIES.has(code)) return "JP";
  if (ME_COUNTRIES.has(code)) return "ME";
  if (AF_COUNTRIES.has(code)) return "AF";
  if (OC_COUNTRIES.has(code)) return "OC";
  if (SEA_COUNTRIES.has(code)) return "SEA";
  return "LA"; // Latin America / Caribbean / fallback
}

// Currency by country (rough — covers all in our list, USD fallback)
function currencyForCountry(code: string): string {
  const map: Record<string, string> = {
    US: "USD", CA: "CAD", MX: "MXN",
    GB: "GBP", IE: "EUR", FR: "EUR", ES: "EUR", PT: "EUR", IT: "EUR",
    DE: "EUR", AT: "EUR", NL: "EUR", BE: "EUR", LU: "EUR", FI: "EUR",
    GR: "EUR", HR: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR",
    MT: "EUR", CY: "EUR", ME: "EUR",
    CH: "CHF", DK: "DKK", SE: "SEK", NO: "NOK", IS: "ISK",
    PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
    RU: "RUB", UA: "UAH", BY: "BYN",
    JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", MO: "MOP", TW: "TWD",
    SG: "SGD", MY: "MYR", TH: "THB", PH: "PHP", ID: "IDR", VN: "VND",
    KH: "USD", LA: "LAK", MM: "MMK", BN: "BND", TL: "USD",
    IN: "INR", NP: "NPR", BT: "BTN", LK: "LKR", MV: "MVR",
    PK: "PKR", BD: "BDT", AF: "AFN",
    AE: "AED", QA: "QAR", BH: "BHD", KW: "KWD", OM: "OMR", SA: "SAR",
    IL: "ILS", JO: "JOD", LB: "USD", IR: "IRR", IQ: "IQD", TR: "TRY",
    EG: "EGP", MA: "MAD", TN: "TND", DZ: "DZD",
    ZA: "ZAR", KE: "KES", TZ: "TZS", UG: "UGX", RW: "RWF", ET: "ETB",
    NG: "NGN", GH: "GHS", SN: "XOF", CI: "XOF",
    ZW: "USD", ZM: "ZMW", MZ: "MZN", NA: "NAD", BW: "BWP", MG: "MGA",
    MU: "MUR", SC: "SCR",
    AU: "AUD", NZ: "NZD", FJ: "FJD", PF: "XPF",
    BR: "BRL", AR: "ARS", CL: "CLP", PE: "PEN", CO: "COP", VE: "VES",
    BO: "BOB", PY: "PYG", UY: "UYU", EC: "USD",
    GT: "GTQ", CR: "CRC", PA: "USD", SV: "USD", HN: "HNL", NI: "NIO",
    BZ: "BZD", CU: "CUP", DO: "DOP", JM: "JMD", PR: "USD", BS: "BSD",
    BB: "BBD", HT: "HTG", LC: "XCD", GD: "XCD", DM: "XCD",
    CW: "ANG", AW: "AWG",
    KZ: "KZT", UZ: "UZS", KG: "KGS", TJ: "TJS", TM: "TMT", MN: "MNT",
    GE: "GEL", AM: "AMD", AZ: "AZN", KP: "KPW",
  };
  return map[code] ?? "USD";
}

const ALL_AMENITIES = [
  ["Free Wi-Fi", "Restaurant", "Bar", "Concierge", "24h front desk"],
  ["Free Wi-Fi", "Pool", "Gym", "Spa", "Restaurant"],
  ["Free Wi-Fi", "Rooftop bar", "Restaurant", "Concierge"],
  ["Free Wi-Fi", "Breakfast included", "24h front desk"],
  ["Free Wi-Fi", "Pool", "Beach access", "Restaurant", "Bar"],
  ["Free Wi-Fi", "Spa", "Gym", "Sauna", "Restaurant"],
  ["Free Wi-Fi", "Pet friendly", "Parking", "Breakfast included"],
  ["Free Wi-Fi", "EV charging", "Parking", "Business center"],
  ["Free Wi-Fi", "Airport shuttle", "Restaurant", "24h front desk"],
  ["Free Wi-Fi", "Co-working space", "Coffee bar", "Gym"],
  ["Free Wi-Fi", "Indoor pool", "Hot tub", "Sauna", "Spa"],
  ["Free Wi-Fi", "Garden", "Library", "Restaurant"],
  ["Free Wi-Fi", "Kitchenette", "Washer/Dryer", "Long stay friendly"],
  ["Free Wi-Fi", "Bike rental", "Tour desk", "Breakfast included"],
  ["Free Wi-Fi", "Family rooms", "Kids club", "Pool"],
  ["Free Wi-Fi", "Rooftop pool", "City view", "Lounge"],
  ["Free Wi-Fi", "Hammam", "Spa", "Tea lounge"],
  ["Free Wi-Fi", "Ski storage", "Hot tub", "Restaurant"],
];

const HOTEL_DESCRIPTIONS = [
  (city: string) => `Comfortable, well-located rooms in the heart of ${city}.`,
  (city: string) => `Modern hotel within walking distance of ${city}'s main attractions.`,
  (city: string) => `A reliable home base for exploring ${city} and beyond.`,
  (city: string) => `Stylish boutique stay in one of ${city}'s best neighborhoods.`,
  (city: string) => `Spacious rooms, friendly staff, and great views of ${city}.`,
  (city: string) => `Classic hospitality and contemporary comfort in ${city}.`,
  (city: string) => `Design-led rooms moments from ${city}'s lively dining scene.`,
  (city: string) => `Quiet, leafy retreat just outside the bustle of ${city}.`,
  (city: string) => `Newly refurbished rooms with skyline views over ${city}.`,
  (city: string) => `Family-friendly base with easy transit access across ${city}.`,
  (city: string) => `Business-ready stay near ${city}'s financial district.`,
  (city: string) => `Charming heritage building reimagined for modern travelers in ${city}.`,
  (city: string) => `Wellness-focused hotel with spa rituals inspired by ${city}.`,
];

// Neighborhood-style area labels assigned per hotel index (cycled per city)
const AREA_LABELS = [
  "City Center", "Old Town", "Riverside", "Harbor", "Marina District",
  "Cathedral Quarter", "University Quarter", "Downtown", "Business District",
  "Arts District", "Midtown", "Uptown", "Beachfront", "Lakeside",
  "Hillside", "Airport Area", "Train Station Area", "Cultural Quarter",
];

function pseudoRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Hash a string deterministically to a 32-bit int
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TIER_PRICE_BASE = { 1: 220, 2: 150, 3: 95, 4: 70 } as const;
// Bumped roughly 3x to massively expand the catalog while keeping seasonality cheap.
const TIER_HOTEL_COUNT = { 1: 14, 2: 9, 3: 6, 4: 3 } as const;
const TIER_CAR_COUNT = { 1: 8, 2: 6, 3: 4, 4: 3 } as const;

// `TIER_PRICE_BASE` and the per-class car prices are denominated in USD-equivalent
// magnitudes (e.g. ~$150/night). When we tag a row with the local currency
// (JPY, KRW, IDR, …) we need to scale the number into that currency so a
// "171" stored against JPY isn't treated as ¥171 (~$1) downstream.
// Inverse rates: 1 USD = N <currency>. Mirrors the FX table in travel-chat.
const USD_TO: Record<string, number> = {
  USD: 1, EUR: 0.93, GBP: 0.79, CHF: 0.88, JPY: 149, CNY: 7.1,
  AUD: 1.52, NZD: 1.64, CAD: 1.35, MXN: 17.2, BRL: 5.0, ARS: 900,
  CLP: 900, COP: 4000, PEN: 3.7,
  AED: 3.67, SAR: 3.75, QAR: 3.64, BHD: 0.38, KWD: 0.31, OMR: 0.385,
  INR: 83, PKR: 280, BDT: 110, LKR: 305, NPR: 133,
  THB: 36, VND: 24500, IDR: 15800, MYR: 4.7, SGD: 1.35, PHP: 56,
  KRW: 1370, TWD: 32, HKD: 7.8,
  TRY: 33, ILS: 3.7, EGP: 50, MAD: 10, ZAR: 18.5,
  DKK: 6.9, SEK: 10.6, NOK: 10.9, ISK: 139,
  PLN: 4.0, CZK: 23, HUF: 370, RON: 4.6, BGN: 1.82,
  RUB: 92, UAH: 41, BYN: 3.3,
  KES: 130, NGN: 1500,
};
function localize(amountUsd: number, currency: string): number {
  const rate = USD_TO[currency.toUpperCase()];
  if (!rate) return amountUsd; // unknown → leave as-is
  // Round to a sensible step per currency: whole units for big-number FX
  // (JPY, KRW, VND, …), 2 decimals for the rest.
  const wholeOnly = rate >= 50;
  const v = amountUsd * rate;
  return wholeOnly ? Math.round(v) : Math.round(v * 100) / 100;
}

function generateHotels(): HotelSeed[] {
  const out: HotelSeed[] = [];
  for (const [city, country, code, lat, lng, tier] of CITIES as CityTuple[]) {
    const count = TIER_HOTEL_COUNT[tier];
    const rng = pseudoRandom(hashStr(`${city}|${country}|h`));
    for (let i = 0; i < count; i++) {
      const prefix = HOTEL_BRAND_PREFIXES[Math.floor(rng() * HOTEL_BRAND_PREFIXES.length)];
      const suffix = HOTEL_BRAND_SUFFIXES[Math.floor(rng() * HOTEL_BRAND_SUFFIXES.length)];
      // Distribute across 2-5 stars so big cities aren't all 3-star clones.
      // Roughly: 15% 5★, 25% 4★, 35% 3★, 25% 2★.
      const starRoll = rng();
      const stars = (
        i === 0 ? 5 :
        i === 1 ? 5 :
        starRoll < 0.15 ? 5 :
        starRoll < 0.40 ? 4 :
        starRoll < 0.75 ? 3 :
        2
      ) as 1|2|3|4|5;
      const ratingBase = stars >= 5 ? 4.6 : stars === 4 ? 4.4 : stars === 3 ? 4.2 : 4.0;
      const rating = Math.round((ratingBase + rng() * 0.3) * 10) / 10;
      const reviews = 200 + Math.floor(rng() * 1800);
      const amenities = ALL_AMENITIES[Math.floor(rng() * ALL_AMENITIES.length)];
      const image = HOTEL_IMAGES[Math.floor(rng() * HOTEL_IMAGES.length)];
      const desc = HOTEL_DESCRIPTIONS[Math.floor(rng() * HOTEL_DESCRIPTIONS.length)](city);
      const area = AREA_LABELS[i % AREA_LABELS.length];
      const tierMult = stars >= 5 ? 1.6 : stars === 4 ? 1.1 : stars === 3 ? 0.85 : 0.65;
      const priceUsd = TIER_PRICE_BASE[tier] * tierMult * (0.85 + rng() * 0.3);
      const cur = currencyForCountry(code);
      const price = localize(priceUsd, cur);
      // small jitter on coordinates so hotels aren't all stacked
      const jitter = () => (rng() - 0.5) * 0.08;
      out.push({
        name: `${prefix} ${suffix} ${city}`,
        city,
        country,
        area,
        latitude: Math.round((lat + jitter()) * 1e6) / 1e6,
        longitude: Math.round((lng + jitter()) * 1e6) / 1e6,
        stars,
        rating,
        reviews_count: reviews,
        amenities,
        image_url: image,
        base_price_per_night: price,
        currency: cur,
        description: desc,
      });
    }
  }
  return out;
}

function generateCars(): CarSeed[] {
  const out: CarSeed[] = [];
  for (const [city, country, code, lat, lng, tier] of CITIES as CityTuple[]) {
    const count = TIER_CAR_COUNT[tier];
    const region = regionForCountry(code);
    const templates = CAR_TEMPLATES_BY_REGION[region];
    const rng = pseudoRandom(hashStr(`${city}|${country}|c`));
    // Pick `count` templates — allow repeats once we exhaust distinct ones,
    // because we now generate up to 8 per top-tier city.
    const order: number[] = [];
    const distinct = new Set<number>();
    while (distinct.size < Math.min(count, templates.length)) {
      const k = Math.floor(rng() * templates.length);
      if (!distinct.has(k)) {
        distinct.add(k);
        order.push(k);
      }
    }
    while (order.length < count) {
      order.push(Math.floor(rng() * templates.length));
    }
    const PICKUP_LOCATIONS = [
      `${city} Airport`,
      `${city} City Center`,
      `${city} Train Station`,
      `${city} Downtown`,
      `${city} Port`,
    ];
    for (let i = 0; i < order.length; i++) {
      const idx = order[i];
      const [name, vehicleClass, transmission, seats, doors, bags] = templates[idx];
      const supplier = CAR_SUPPLIERS[Math.floor(rng() * CAR_SUPPLIERS.length)];
      const features =
        vehicleClass === "luxury"
          ? ["Leather", "Adaptive cruise", "Heated seats", "Bluetooth"]
          : vehicleClass === "suv" || vehicleClass === "fullsize-suv"
          ? ["GPS", "Bluetooth", "Cruise control", "Roof rails"]
          : vehicleClass === "minivan"
          ? ["Sliding doors", "Bluetooth", "Cruise control"]
          : ["Bluetooth", "Apple CarPlay", "Air conditioning"];
      const image = CAR_IMAGES[Math.floor(rng() * CAR_IMAGES.length)];
      const baseByClass: Record<string, number> = {
        economy: 24, compact: 32, intermediate: 44, suv: 62, luxury: 110,
        minivan: 80, "fullsize-suv": 95, kei: 26,
      };
      const tierMult = tier === 1 ? 1.25 : tier === 2 ? 1.05 : tier === 3 ? 0.95 : 0.85;
      const priceUsd = (baseByClass[vehicleClass] ?? 40) * tierMult * (0.9 + rng() * 0.25);
      const cur = currencyForCountry(code);
      const price = localize(priceUsd, cur);
      const jitter = () => (rng() - 0.5) * 0.08;
      const location = PICKUP_LOCATIONS[i % PICKUP_LOCATIONS.length];
      out.push({
        name,
        vehicle_class: vehicleClass,
        transmission,
        seats, doors, bags,
        features,
        image_url: image,
        pickup_city: city,
        pickup_country: country,
        pickup_location_name: location,
        latitude: Math.round((lat + jitter()) * 1e6) / 1e6,
        longitude: Math.round((lng + jitter()) * 1e6) / 1e6,
        supplier: supplier.name,
        supplier_rating: Math.round((supplier.rating + (rng() - 0.5) * 0.3) * 10) / 10,
        base_price_per_day: price,
        currency: cur,
      });
    }
  }
  return out;
}

const HOTELS: HotelSeed[] = generateHotels();
const CARS: CarSeed[] = generateCars();

function priceMultiplierForDate(d: Date): number {
  // Weekend bump + summer/holiday seasonality, deterministic per date
  const dow = d.getUTCDay(); // 0 Sun ... 6 Sat
  const month = d.getUTCMonth(); // 0..11
  let m = 1.0;
  if (dow === 5 || dow === 6) m += 0.18; // Fri/Sat
  if (dow === 0) m += 0.05; // Sun slight
  if (month === 6 || month === 7) m += 0.22; // peak summer
  if (month === 11) m += 0.15; // December
  // Tiny deterministic jitter
  const seed = d.getUTCDate() + d.getUTCMonth() * 31;
  const jitter = ((seed * 9301 + 49297) % 233280) / 233280; // 0..1
  m += (jitter - 0.5) * 0.08;
  return Math.max(0.6, Math.min(1.8, m));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") ?? 45)));
    const skipAvailability = url.searchParams.get("skipAvailability") === "1";
    const skipCatalog = url.searchParams.get("skipCatalog") === "1";
    // Optional city slice for paginated seeding (helps avoid timeouts on large catalogs)
    const cityFrom = Math.max(0, Number(url.searchParams.get("cityFrom") ?? 0));
    const cityToParam = url.searchParams.get("cityTo");
    const cityTo = cityToParam !== null ? Math.min(CITIES.length, Number(cityToParam)) : CITIES.length;
    const useSlice = cityFrom > 0 || cityToParam !== null;

    // Filter HOTELS / CARS to only those whose city falls in the requested slice
    const sliceCities = new Set(
      CITIES.slice(cityFrom, cityTo).map(([city, country]) => `${city}|${country}`),
    );
    const hotelsToSeed = useSlice ? HOTELS.filter((h) => sliceCities.has(`${h.city}|${h.country}`)) : HOTELS;
    const carsToSeed = useSlice ? CARS.filter((c) => sliceCities.has(`${c.pickup_city}|${c.pickup_country}`)) : CARS;

    // 1. Catalog idempotency check
    const { count: hotelCount } = await admin.from("hotels").select("*", { count: "exact", head: true });
    const { count: carCount } = await admin.from("rental_cars").select("*", { count: "exact", head: true });

    let hotelsInserted = 0;
    let carsInserted = 0;

    // Helper to chunk-insert with limited parallelism
    async function chunkInsert(table: string, rows: any[], size = 1000, concurrency = 4) {
      const chunks: any[][] = [];
      for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
      let nextIdx = 0;
      const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
        while (true) {
          const myIdx = nextIdx++;
          if (myIdx >= chunks.length) return;
          const { error } = await admin.from(table).insert(chunks[myIdx]);
          if (error) throw error;
        }
      });
      await Promise.all(workers);
    }

    if (!skipCatalog) {
      // Wipe existing catalog only on force AND only on the FIRST slice (or when not slicing)
      if (force && (!useSlice || cityFrom === 0)) {
        await admin.from("hotels").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await admin.from("rental_cars").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      }

      if (force || (hotelCount ?? 0) === 0) {
        await chunkInsert("hotels", hotelsToSeed, 500, 4);
        hotelsInserted = hotelsToSeed.length;
      }
      if (force || (carCount ?? 0) === 0) {
        await chunkInsert("rental_cars", carsToSeed, 500, 4);
        carsInserted = carsToSeed.length;
      }
    }

    if (skipAvailability) {
      return new Response(JSON.stringify({
        ok: true,
        brand: "Wanderlush Holdings™",
        hotelsInserted,
        carsInserted,
        hotelAvailabilityRows: 0,
        carAvailabilityRows: 0,
        days,
        sliced: useSlice ? { cityFrom, cityTo, totalCities: CITIES.length } : undefined,
        note: "skipAvailability=1 — only catalog was seeded.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Build availability for the next `days` days
    // Query hotels/cars for the relevant cities directly to avoid PostgREST row caps.
    type HotelRow = { id: string; base_price_per_night: number; city: string; country: string };
    type CarRow = { id: string; base_price_per_day: number; pickup_city: string; pickup_country: string };

    let hotelsForAvail: HotelRow[] = [];
    let carsForAvail: CarRow[] = [];

    if (useSlice) {
      // Get unique city names in the slice; filter by city IN (...) and verify country in JS
      const sliceCityNames = Array.from(new Set(CITIES.slice(cityFrom, cityTo).map(([c]) => c)));
      // Chunk IN() to keep URLs reasonable
      for (let i = 0; i < sliceCityNames.length; i += 50) {
        const chunk = sliceCityNames.slice(i, i + 50);
        const [hRes, cRes] = await Promise.all([
          admin.from("hotels").select("id, base_price_per_night, city, country").in("city", chunk).limit(2000),
          admin.from("rental_cars").select("id, base_price_per_day, pickup_city, pickup_country").in("pickup_city", chunk).limit(2000),
        ]);
        if (hRes.error) throw hRes.error;
        if (cRes.error) throw cRes.error;
        for (const h of (hRes.data ?? []) as HotelRow[]) {
          if (sliceCities.has(`${h.city}|${h.country}`)) hotelsForAvail.push(h);
        }
        for (const c of (cRes.data ?? []) as CarRow[]) {
          if (sliceCities.has(`${c.pickup_city}|${c.pickup_country}`)) carsForAvail.push(c);
        }
      }
    } else {
      // Full fetch: paginate via .range()
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin.from("hotels")
          .select("id, base_price_per_night, city, country")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        hotelsForAvail.push(...(data as HotelRow[]));
        if (data.length < pageSize) break;
      }
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin.from("rental_cars")
          .select("id, base_price_per_day, pickup_city, pickup_country")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        carsForAvail.push(...(data as CarRow[]));
        if (data.length < pageSize) break;
      }
    }

    console.log("seed-counts", {
      slice: useSlice ? `${cityFrom}-${cityTo}` : "all",
      hotelsForAvail: hotelsForAvail.length,
      carsForAvail: carsForAvail.length,
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dates: Date[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() + i);
      dates.push(d);
    }

    // Wipe existing future availability for THESE hotels/cars so re-runs are clean.
    // Only wipe broadly when force AND first slice (or no slice). Otherwise wipe per-id batch.
    const startStr = fmtDate(dates[0]);
    const endStr = fmtDate(dates[dates.length - 1]);
    if (force && (!useSlice || cityFrom === 0)) {
      await admin.from("hotel_availability").delete().gte("date", startStr).lte("date", endStr);
      await admin.from("rental_car_availability").delete().gte("date", startStr).lte("date", endStr);
    } else if (useSlice) {
      // Best-effort cleanup for sliced mode: delete rows for these specific ids
      const hIds = hotelsForAvail.map((h: any) => h.id);
      const cIds = carsForAvail.map((c: any) => c.id);
      for (let i = 0; i < hIds.length; i += 200) {
        await admin.from("hotel_availability").delete().in("hotel_id", hIds.slice(i, i + 200))
          .gte("date", startStr).lte("date", endStr);
      }
      for (let i = 0; i < cIds.length; i += 200) {
        await admin.from("rental_car_availability").delete().in("car_id", cIds.slice(i, i + 200))
          .gte("date", startStr).lte("date", endStr);
      }
    }

    const hotelRows: any[] = [];
    for (const h of hotelsForAvail) {
      for (const d of dates) {
        const mult = priceMultiplierForDate(d);
        const seed = (d.getUTCDate() * 17 + d.getUTCMonth() * 7) % 37;
        const rooms = seed === 0 ? 0 : 2 + (seed % 8); // rare sold-out days
        hotelRows.push({
          hotel_id: h.id,
          date: fmtDate(d),
          rooms_available: rooms,
          price_per_night: Math.round(Number(h.base_price_per_night) * mult * 100) / 100,
        });
      }
    }
    const carRows: any[] = [];
    for (const c of carsForAvail) {
      for (const d of dates) {
        const mult = priceMultiplierForDate(d);
        const seed = (d.getUTCDate() * 13 + d.getUTCMonth() * 5) % 31;
        const units = seed === 0 ? 0 : 2 + (seed % 6);
        carRows.push({
          car_id: c.id,
          date: fmtDate(d),
          units_available: units,
          price_per_day: Math.round(Number(c.base_price_per_day) * mult * 100) / 100,
        });
      }
    }

    await chunkInsert("hotel_availability", hotelRows, 1500, 6);
    await chunkInsert("rental_car_availability", carRows, 1500, 6);

    return new Response(JSON.stringify({
      ok: true,
      brand: "Wanderlush Holdings™",
      hotelsInserted,
      carsInserted,
      hotelAvailabilityRows: hotelRows.length,
      carAvailabilityRows: carRows.length,
      days,
      sliced: useSlice ? { cityFrom, cityTo, totalCities: CITIES.length } : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("wanderlush-seed error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
