/**
 * Currency display helpers.
 *
 * Skyscanner / Wanderlush results carry an ISO-4217 `currency` per offer
 * (default EUR). We format with `Intl.NumberFormat` so EUR renders as
 * "€352", JPY as "¥149,000", etc., without us hardcoding a "$" anywhere.
 *
 * `formatPrice` produces a whole-number display by default — flight/hotel
 * prices are already rounded server-side and showing two decimals just adds
 * noise to the chat cards.
 */

export function formatPrice(
  amount: number | null | undefined,
  currency: string | null | undefined = "EUR",
  opts: { withCents?: boolean } = {},
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const cur = (currency || "EUR").toUpperCase();
  const fractionDigits = opts.withCents ? 2 : 0;
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(Number(amount));
  } catch {
    // Unknown currency code — fall back to "<code> <amount>".
    return `${cur} ${Math.round(Number(amount)).toLocaleString()}`;
  }
}

/**
 * Static FX table (units of currency per 1 EUR). Indicative rates so the
 * preview always shows prices in the user's preferred currency without
 * needing a live FX API. We mark converted prices as "indicative" in the UI.
 * Update periodically.
 */
const EUR_RATES: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  JPY: 165,
  CHF: 0.95,
  CAD: 1.47,
  AUD: 1.65,
  NZD: 1.79,
  SEK: 11.3,
  NOK: 11.7,
  DKK: 7.46,
  PLN: 4.3,
  CZK: 25.2,
  HUF: 395,
  RON: 4.97,
  BGN: 1.96,
  TRY: 38,
  RUB: 100,
  CNY: 7.85,
  HKD: 8.45,
  SGD: 1.45,
  KRW: 1480,
  INR: 92,
  THB: 39,
  IDR: 17500,
  MYR: 5.05,
  PHP: 62,
  VND: 27000,
  AED: 3.97,
  SAR: 4.05,
  ILS: 4.0,
  ZAR: 20.5,
  EGP: 53,
  MXN: 21.5,
  BRL: 5.5,
  ARS: 1080,
  CLP: 1020,
  COP: 4400,
  PEN: 4.05,
  ISK: 150,
};

/**
 * Convert an amount from one ISO currency code to another using static rates.
 * Returns `null` if either currency is unknown OR amount is invalid (so the
 * caller can gracefully fall back to displaying the original).
 */
export function convertAmount(
  amount: number | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const f = (from || "EUR").toUpperCase();
  const t = (to || "EUR").toUpperCase();
  if (f === t) return Number(amount);
  const fromRate = EUR_RATES[f];
  const toRate = EUR_RATES[t];
  if (!fromRate || !toRate) return null;
  // amount in `from` → EUR → `to`
  const eur = Number(amount) / fromRate;
  return eur * toRate;
}

/**
 * Convert + format. If conversion isn't possible (unknown currency), falls
 * back to formatting in the original currency so the user still sees a price.
 */
export function formatConverted(
  amount: number | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  opts: { withCents?: boolean } = {},
): string {
  if (amount == null) return "—";
  const target = (toCurrency || "EUR").toUpperCase();
  const source = (fromCurrency || "EUR").toUpperCase();
  if (source === target) return formatPrice(amount, source, opts);
  const converted = convertAmount(amount, source, target);
  if (converted == null) return formatPrice(amount, source, opts);
  return formatPrice(converted, target, opts);
}

export function isConvertible(from: string | null | undefined, to: string | null | undefined): boolean {
  const f = (from || "EUR").toUpperCase();
  const t = (to || "EUR").toUpperCase();
  if (f === t) return true;
  return !!EUR_RATES[f] && !!EUR_RATES[t];
}
