export type Stop = {
  city: string;
  code: string;
  time: string; // "08:45"
  date?: string; // "Mon 12 May"
  isoDate?: string; // "2025-05-12" — used for deep links
  airport?: string;
};

export type FlightSegment = {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  from: Stop;
  to: Stop;
  durationMin: number;
  stops: number;
  stopover?: string; // "1h 20m in MAD"
};

export type FlightOffer = {
  id: string;
  price: number;
  /** Skyscanner price is total for all travellers — this is the per-person split. */
  pricePerPerson?: number;
  /** How many adults the price covers (defaults to 1 if absent). */
  adults?: number;
  /** How many children the price covers (defaults to 0 if absent). */
  childrenCount?: number;
  currency: string; // ISO 4217, e.g. "EUR"
  outbound: FlightSegment;
  return?: FlightSegment;
  badge?: "Cheapest" | "Fastest" | "Best";
  cabin?: string; // "Economy"
  bagsIncluded?: number;
  refundable?: boolean;
};

export type HotelOffer = {
  id: string;
  name: string;
  area: string;
  rating: number; // 0-5
  reviews: number;
  pricePerNight: number;
  currency: string;
  totalNights: number;
  image: string; // emoji or url placeholder
  amenities: string[];
  badge?: "Top rated" | "Best value" | "Popular";
  distanceFromCenter?: string;
  stars?: number;
  totalPrice?: number;
  brand?: string;
  description?: string;
};

export type CarOffer = {
  id: string;
  name: string;
  brand: string;
  vehicleClass: string;
  transmission: "automatic" | "manual";
  seats: number;
  doors: number;
  bags: number;
  features: string[];
  image: string;
  pickupCity: string;
  pickupCountry: string;
  pickupLocationName: string;
  supplier: string;
  supplierRating: number; // 0-5
  pricePerDay: number;
  totalPrice: number;
  totalDays: number;
  currency: string;
  badge?: "Cheapest" | "Top rated" | "Popular";
};

export type HotelPriceSummary = {
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
  totalNights: number;
  currency: string;
  cheapest?: number;
  average?: number;
  median?: number;
  starsBreakdown?: Array<{ stars: number; cheapest?: number; average?: number; median?: number }>;
  source: "indicative";
  note?: string;
};

export type ResultBlock =
  | { kind: "flights"; query: string; offers: FlightOffer[] }
  | { kind: "hotels"; query: string; offers: HotelOffer[] }
  | { kind: "hotelSummary"; query: string; summary: HotelPriceSummary }
  | { kind: "cars"; query: string; offers: CarOffer[] }
  | { kind: "questions"; query: string; questions: QuestionField[]; submitLabel?: string }
  | {
      kind: "bundle";
      query: string;
      /** Component sub-results (any mix of flights/hotels/cars/hotelSummary). */
      blocks: Array<
        | { kind: "flights"; query: string; offers: FlightOffer[] }
        | { kind: "hotels"; query: string; offers: HotelOffer[] }
        | { kind: "hotelSummary"; query: string; summary: HotelPriceSummary }
        | { kind: "cars"; query: string; offers: CarOffer[] }
      >;
      /** Combined low-end estimate across the cheapest pick of each kind. */
      total?: {
        amount: number;
        currency: string;
        basis: string;
        /** Trip length the total was normalised to, in days (cars) / nights (hotels). */
        days?: number;
        /** Per-component contribution to the bundle total, all in the bundle currency. */
        breakdown?: Array<{
          kind: "flights" | "hotels" | "cars" | "hotelSummary";
          label: string;
          amount: number;
          currency: string;
          detail?: string;
        }>;
      };
    };

export type QuestionField = {
  /** Stable id used as the form key and echoed back in the answer payload. */
  id: string;
  /** Human-readable question shown above the input. */
  label: string;
  /** Optional extra hint shown under the label. */
  hint?: string;
  /** Whether an answer is required before submitting. Defaults to true. */
  required?: boolean;
  /**
   * Conditional visibility — the field is hidden (and its value omitted from the
   * submitted answer) unless the referenced field's current value matches.
   * Used for follow-ups like "If not, where from instead?" that depend on a
   * yes/no toggle earlier in the same form.
   */
  showIf?: {
    id: string;
    equals: boolean | string | number;
  };
} & (
  | { type: "boolean"; default?: boolean }
  | { type: "single"; options: string[]; default?: string }
  | { type: "multi"; options: string[]; default?: string[] }
  | {
      type: "text";
      placeholder?: string;
      default?: string;
      /** Optional input mode/format. "email" → email; "number" → numeric; "tel" → phone. */
      format?: "email" | "number" | "tel";
      minLength?: number;
      maxLength?: number;
      /** Inclusive min/max for numeric inputs. */
      min?: number;
      max?: number;
    }
  | {
      type: "number";
      placeholder?: string;
      default?: number;
      /** Inclusive min/max. */
      min?: number;
      max?: number;
      /** Step for the number input. Defaults to 1. */
      step?: number;
    }
  | {
      type: "date";
      /** YYYY-MM-DD */
      default?: string;
      /** YYYY-MM-DD — earliest selectable date (inclusive). */
      minDate?: string;
      /** YYYY-MM-DD — latest selectable date (inclusive). */
      maxDate?: string;
    }
);

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string; // markdown
  results?: ResultBlock;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};