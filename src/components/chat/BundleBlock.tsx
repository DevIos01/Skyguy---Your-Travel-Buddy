import { useState } from "react";
import {
  Sparkles,
  Plane,
  BedDouble,
  Car,
  ChevronDown,
  ChevronUp,
  Star,
  Users,
  Briefcase,
  Cog,
} from "lucide-react";
import type {
  ResultBlock,
  FlightOffer,
  HotelOffer,
  CarOffer,
  HotelPriceSummary,
} from "@/types/chat";
import { FlightCard } from "./FlightCard";
import { HotelCard } from "./HotelCard";
import { CarCard } from "./CarCard";
import { HotelSummaryCard } from "./HotelSummaryCard";
import { cn } from "@/lib/utils";
import { formatConverted } from "@/lib/currency";
import { useUserCurrency } from "@/hooks/useUserCurrency";
import { createContext, useContext } from "react";

// Threading the user's preferred currency into the row helpers without prop drilling.
const BundleCurrencyCtx = createContext<string>("EUR");
const useBundleCurrency = () => useContext(BundleCurrencyCtx);

type BundleResult = Extract<ResultBlock, { kind: "bundle" }>;
type SubBlock = BundleResult["blocks"][number];

function useFmtMoney() {
  const userCurrency = useBundleCurrency();
  return (n: number, currency: string) => formatConverted(n, currency, userCurrency);
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Picks the offer the bundle total is built on (cheapest of each kind).
 * Mirrors the same selection the backend uses in `buildBundle()`.
 */
function pickHero(b: SubBlock): FlightOffer | HotelOffer | CarOffer | HotelPriceSummary {
  if (b.kind === "hotelSummary") return b.summary;
  const offers = (b as { offers: Array<FlightOffer | HotelOffer | CarOffer> }).offers;
  return offers.reduce((cheapest, o: any) => {
    const cur = (cheapest as any).price ?? (cheapest as any).totalPrice ?? Number.POSITIVE_INFINITY;
    const next = o.price ?? o.totalPrice ?? Number.POSITIVE_INFINITY;
    return next < cur ? o : cheapest;
  }, offers[0]);
}

function FlightRow({ offer }: { offer: FlightOffer }) {
  const out = offer.outbound;
  const ret = offer.return;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {out.from.time}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">{out.from.code}</span>
          <span className="text-muted-foreground/60">→</span>
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {out.to.time}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">{out.to.code}</span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {fmtDuration(out.durationMin)} · {out.stops === 0 ? "Direct" : `${out.stops} stop`}
        </span>
      </div>
      {ret && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {ret.from.time}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">{ret.from.code}</span>
            <span className="text-muted-foreground/60">→</span>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {ret.to.time}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">{ret.to.code}</span>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {fmtDuration(ret.durationMin)} · {ret.stops === 0 ? "Direct" : `${ret.stops} stop`}
          </span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {out.airline}
        {offer.cabin ? ` · ${offer.cabin}` : ""}
      </p>
    </div>
  );
}

function HotelRow({ offer }: { offer: HotelOffer }) {
  const fmtMoney = useFmtMoney();
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground leading-tight truncate">{offer.name}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {offer.area && <span>{offer.area}</span>}
        {offer.stars ? (
          <span className="text-foreground/80" aria-label={`${offer.stars} stars`}>
            {"★".repeat(offer.stars)}
          </span>
        ) : null}
        {offer.rating ? (
          <span className="inline-flex items-center gap-0.5">
            <Star className="h-2.5 w-2.5 fill-current text-primary" />
            {offer.rating.toFixed(1)}
          </span>
        ) : null}
        <span className="text-foreground/80">
          {fmtMoney(offer.pricePerNight, offer.currency)}/night
          {offer.totalNights > 1 && ` · ${offer.totalNights} nights`}
        </span>
      </div>
    </div>
  );
}

function HotelSummaryRow({ summary }: { summary: HotelPriceSummary }) {
  const fmtMoney = useFmtMoney();
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground leading-tight truncate">
        {summary.destination}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>Indicative · {summary.totalNights} night{summary.totalNights > 1 ? "s" : ""}</span>
        {summary.cheapest && (
          <span className="text-foreground/80">
            from {fmtMoney(summary.cheapest, summary.currency)}/night
          </span>
        )}
      </div>
    </div>
  );
}

function CarRow({ offer }: { offer: CarOffer }) {
  const fmtMoney = useFmtMoney();
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground leading-tight truncate">
        {offer.name}
        <span className="ml-1 font-normal text-muted-foreground">· {offer.vehicleClass}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Cog className="h-2.5 w-2.5" />
          {offer.transmission}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Users className="h-2.5 w-2.5" />
          {offer.seats}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Briefcase className="h-2.5 w-2.5" />
          {offer.bags}
        </span>
        <span className="text-foreground/80">
          {fmtMoney(offer.pricePerDay, offer.currency)}/day
          {offer.totalDays > 1 && ` · ${offer.totalDays} days`}
        </span>
      </div>
    </div>
  );
}

function PickRow({
  block,
  contribution,
}: {
  block: SubBlock;
  contribution?: { amount: number; currency: string; detail?: string };
}) {
  const fmtMoney = useFmtMoney();
  const Icon =
    block.kind === "flights" ? Plane : block.kind === "cars" ? Car : BedDouble;
  const kindLabel =
    block.kind === "flights" ? "Flight"
    : block.kind === "cars" ? "Car"
    : block.kind === "hotels" ? "Hotel"
    : "Hotel est.";

  const hero = pickHero(block);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {kindLabel}
        </p>
        <div className="mt-0.5">
          {block.kind === "flights" && <FlightRow offer={hero as FlightOffer} />}
          {block.kind === "hotels" && <HotelRow offer={hero as HotelOffer} />}
          {block.kind === "hotelSummary" && <HotelSummaryRow summary={hero as HotelPriceSummary} />}
          {block.kind === "cars" && <CarRow offer={hero as CarOffer} />}
        </div>
      </div>
      {contribution && (
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {fmtMoney(contribution.amount, contribution.currency)}
          </p>
          {contribution.detail && (
            <p className="text-[10px] text-muted-foreground">{contribution.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the bundle as ONE dedicated card (header → per-pick rows → total).
 * An optional "More options" section reveals the original ResultsBlock-style
 * cards for users who want to compare alternatives, but the default view is
 * a single, glanceable summary card matching the rest of the chat UI.
 */
export function BundleBlock({ block }: { block: BundleResult }) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const userCurrency = useUserCurrency();
  const fmtMoney = (n: number, currency: string) => formatConverted(n, currency, userCurrency);
  const totalConverted = block.total
    ? userCurrency.toUpperCase() !== (block.total.currency || "EUR").toUpperCase()
    : false;

  const total = block.total;
  const breakdown = total?.breakdown ?? [];
  const breakdownByKind = new Map(breakdown.map((b) => [b.kind, b]));

  const altCount = block.blocks.reduce((sum, b) => {
    if (b.kind === "hotelSummary") return sum;
    return sum + Math.max(0, ((b as any).offers?.length ?? 0) - 1);
  }, 0);

  return (
    <BundleCurrencyCtx.Provider value={userCurrency}>
    <div className="mt-4 overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary-soft/60 via-card to-card px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-sky text-white shadow-glow ring-1 ring-foreground/10">
          <Sparkles className="h-4 w-4 drop-shadow-sm" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">
            Trip bundle
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {block.query}
          </p>
        </div>
      </div>

      {/* Picked options — one row per kind */}
      <div className="divide-y divide-border">
        {block.blocks.map((b) => {
          const contribution = breakdownByKind.get(b.kind);
          return (
            <PickRow
              key={b.kind}
              block={b}
              contribution={
                contribution
                  ? {
                      amount: contribution.amount,
                      currency: contribution.currency,
                      detail: contribution.detail,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Combined total */}
      {total && (
        <div className="flex items-end justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Combined total
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {totalConverted
                ? `Shown in ${userCurrency} · indicative`
                : total.basis?.includes("converted")
                  ? `Converted to ${total.currency} · indicative`
                  : total.basis ?? "Cheapest pick of each, summed"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold text-foreground leading-none tabular-nums">
              {fmtMoney(total.amount, total.currency)}
            </p>
            {total.days ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {total.days}-day trip
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Optional alternatives drawer */}
      {altCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAlternatives((v) => !v)}
            aria-expanded={showAlternatives}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 border-t border-border bg-card px-3 py-2",
              "text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            )}
          >
            {showAlternatives ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Hide alternatives
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show {altCount} other option{altCount > 1 ? "s" : ""}
              </>
            )}
          </button>
          {showAlternatives && (
            <div className="space-y-3 border-t border-border bg-secondary/30 p-3">
              {block.blocks.map((b, i) => (
                <AlternativesGroup key={`${b.kind}-${i}`} block={b} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </BundleCurrencyCtx.Provider>
  );
}

function AlternativesGroup({ block }: { block: SubBlock }) {
  if (block.kind === "hotelSummary") {
    return <HotelSummaryCard summary={block.summary} />;
  }
  // Skip the first (already shown as the picked hero above).
  const others = (block.offers as Array<FlightOffer | HotelOffer | CarOffer>).slice(1);
  if (others.length === 0) return null;

  const Icon = block.kind === "flights" ? Plane : block.kind === "cars" ? Car : BedDouble;
  const label =
    block.kind === "flights" ? "Other flights"
    : block.kind === "cars" ? "Other cars"
    : "Other hotels";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 text-primary" />
        {label}
      </div>
      <div className="space-y-3">
        {block.kind === "flights" && others.map((o) => <FlightCard key={o.id} offer={o as FlightOffer} />)}
        {block.kind === "hotels" && others.map((o) => <HotelCard key={o.id} offer={o as HotelOffer} />)}
        {block.kind === "cars" && others.map((o) => <CarCard key={o.id} offer={o as CarOffer} />)}
      </div>
    </div>
  );
}