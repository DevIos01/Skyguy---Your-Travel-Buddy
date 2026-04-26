import type { FlightOffer, ResultBlock } from "@/types/chat";

// Skyscanner expects YYMMDD in flight URLs.
function toShortDate(iso?: string): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1].slice(2)}${m[2]}${m[3]}`;
}

// Skyscanner only accepts real 3-letter IATA codes in the URL path.
function isIata(code?: string): boolean {
  return !!code && /^[A-Za-z]{3}$/.test(code);
}

/**
 * Build a Skyscanner flight deep link.
 *
 * Format: /transport/flights/{from}/{to}/{departYYMMDD}[/{returnYYMMDD}]/?adults=N&children=N&cabinclass=economy
 * Note: Skyscanner uses ONE origin/destination pair for the whole itinerary —
 * the return leg only contributes its date, NOT a second from/to pair.
 *
 * We carry over adult / children counts and cabin class from the offer so the
 * Skyscanner page lands pre-filled with the same party Mistral searched for —
 * otherwise Skyscanner re-prices for 1 adult and the user sees a different
 * total than what we showed in chat.
 *
 * Falls back to a search query on the homepage if codes/dates aren't usable.
 */
export function flightOfferUrl(offer: FlightOffer): string {
  const ob = offer.outbound;
  const fromCode = ob?.from?.code;
  const toCode = ob?.to?.code;
  const obDate = toShortDate(ob?.from?.isoDate);

  // Need valid IATA codes + a depart date. Otherwise the URL is invalid on Skyscanner.
  if (!isIata(fromCode) || !isIata(toCode) || !obDate) {
    const fromName = ob?.from?.city || ob?.from?.code || "";
    const toName = ob?.to?.city || ob?.to?.code || "";
    const q = encodeURIComponent([fromName, "to", toName].filter(Boolean).join(" "));
    return q ? `https://www.skyscanner.net/?q=${q}` : "https://www.skyscanner.net/";
  }

  const from = fromCode!.toLowerCase();
  const to = toCode!.toLowerCase();
  const cabin = (offer.cabin || "economy").toLowerCase().replace(/\s+/g, "");
  const rtDate = offer.return ? toShortDate(offer.return.from?.isoDate) : null;
  const datePath = rtDate ? `${obDate}/${rtDate}` : obDate;
  const adults = Math.max(1, offer.adults ?? 1);
  const children = Math.max(0, offer.childrenCount ?? 0);
  // Skyscanner's modern flight results page reads `adultsv2` / `childrenv2`
  // (the legacy `adults` / `children` params are ignored and the page
  // re-prices for 1 adult). `childrenv2` is a comma-separated list of ages
  // — we don't track ages on the offer, so default each child to 10 years
  // old, which Skyscanner treats as a standard child fare.
  // We also pass the legacy keys for older mirrors that still honour them.
  const params = new URLSearchParams({
    adultsv2: String(adults),
    adults: String(adults),
    cabinclass: cabin,
    rtn: rtDate ? "1" : "0",
    preferdirects: "false",
    outboundaltsenabled: "false",
    inboundaltsenabled: "false",
  });
  if (children > 0) {
    const ages = Array(children).fill("10").join(",");
    params.set("childrenv2", ages);
    params.set("children", String(children));
  }
  return `https://www.skyscanner.net/transport/flights/${from}/${to}/${datePath}/?${params.toString()}`;
}

/** Search-all link covering the same origin/destination as the first offer in the block. */
export function flightSearchUrl(block: Extract<ResultBlock, { kind: "flights" }>): string {
  const first = block.offers[0];
  if (first) return flightOfferUrl(first);
  return "https://www.skyscanner.net/";
}

/** Hotel deep link — we don't have entityIds on the offer, so fall back to a name search. */
export function hotelSearchUrl(name: string, area?: string): string {
  const q = encodeURIComponent([name, area].filter(Boolean).join(" "));
  return `https://www.skyscanner.net/hotels/search?q=${q}`;
}

/** Top-level "view all hotels" link — uses the chat query as a destination search. */
export function hotelListSearchUrl(query: string): string {
  return `https://www.skyscanner.net/hotels/search?q=${encodeURIComponent(query)}`;
}