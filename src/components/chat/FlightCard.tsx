import { Plane, Backpack, Briefcase, Shield, ArrowRight, Info } from "lucide-react";
import type { FlightOffer, FlightSegment } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { flightOfferUrl } from "@/lib/skyscanner";
import { formatConverted } from "@/lib/currency";
import { useUserCurrency } from "@/hooks/useUserCurrency";

function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const badgeStyles: Record<string, string> = {
  Cheapest: "bg-success-soft text-success",
  Fastest: "bg-primary-soft text-primary",
  Best: "bg-accent-soft text-accent",
};

function Leg({ seg, label }: { seg: FlightSegment; label: string }) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="rounded-md bg-muted px-1.5 py-0.5">{label}</span>
        <span className="text-foreground/70 normal-case tracking-normal">{seg.from.date}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        {/* Departure */}
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-foreground leading-tight">{seg.from.time}</p>
          <p className="text-xs text-muted-foreground">{seg.from.code}</p>
        </div>

        {/* Path */}
        <div className="flex flex-col items-center gap-1 px-1">
          <p className="text-[11px] font-medium text-muted-foreground">{formatDuration(seg.durationMin)}</p>
          <div className="relative flex w-full items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="h-px flex-1 bg-border" />
            <Plane className="h-3.5 w-3.5 text-primary -rotate-0" />
            <span className="h-px flex-1 bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {seg.stops === 0 ? (
              <span className="text-success font-medium">Direct</span>
            ) : (
              <>
                {seg.stops} stop{seg.stops > 1 ? "s" : ""}
                {seg.stopover ? ` · ${seg.stopover}` : ""}
              </>
            )}
          </p>
        </div>

        {/* Arrival */}
        <div className="text-left">
          <p className="text-lg font-semibold tabular-nums text-foreground leading-tight">{seg.to.time}</p>
          <p className="text-xs text-muted-foreground">{seg.to.code}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-foreground/80">
          {seg.airlineCode}
        </span>
        <span>{seg.airline} · {seg.flightNumber}</span>
      </div>
    </div>
  );
}

export function FlightCard({ offer }: { offer: FlightOffer }) {
  const userCurrency = useUserCurrency();
  const converted = userCurrency.toUpperCase() !== (offer.currency || "EUR").toUpperCase();
  const travellers = (offer.adults ?? 1) + (offer.childrenCount ?? 0);
  const isSingleTraveller = travellers <= 1;
  // Skyscanner's price is the TOTAL for everyone in the search.
  // Show that headline, with a per-person line underneath when >1 traveller.
  const priceLabel = isSingleTraveller ? "Round-trip" : `Total · ${travellers} travellers`;
  const subLabel = isSingleTraveller
    ? `per person${converted ? " · indicative" : ""}`
    : offer.pricePerPerson
      ? `~${formatConverted(offer.pricePerPerson, offer.currency, userCurrency)} per person${converted ? " · indicative" : ""}`
      : "all travellers";
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30">
      {offer.badge && (
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeStyles[offer.badge])}>
            {offer.badge}
          </span>
          <span className="text-[11px] text-muted-foreground">{offer.cabin}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 p-4">
        <div className="divide-y divide-border/70">
          <Leg seg={offer.outbound} label="Outbound" />
          {offer.return && <Leg seg={offer.return} label="Return" />}
        </div>

        <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border/70 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0 md:min-w-[160px]">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">{priceLabel}</p>
            <p className="text-2xl font-bold tabular-nums text-foreground leading-tight">
              {formatConverted(offer.price, offer.currency, userCurrency)}
            </p>
            <p className="text-[11px] text-muted-foreground">{subLabel}</p>
          </div>

          <div className="flex flex-col items-end gap-1.5 text-[10px] text-muted-foreground">
            <div className="flex flex-wrap justify-end gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"
                title="One small personal item that fits under the seat (e.g. backpack/handbag). Allowed on virtually every fare."
              >
                <Backpack className="h-3 w-3" />
                Personal item · per person
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"
                title="Cabin bag size & weight vary by airline and fare. Typical allowance: ~55×40×20cm, 7–10kg. Confirm on Skyscanner."
              >
                <Briefcase className="h-3 w-3" />
                Cabin bag · varies
              </span>
              {offer.bagsIncluded ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-success">
                  <Briefcase className="h-3 w-3" />
                  {offer.bagsIncluded} checked
                </span>
              ) : null}
              {offer.refundable && (
                <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-success">
                  <Shield className="h-3 w-3" />
                  Refundable
                </span>
              )}
            </div>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80 text-right leading-tight">
              <Info className="h-2.5 w-2.5 shrink-0" />
              <span>Bag rules vary by airline — confirm on Skyscanner.</span>
            </p>
          </div>

          <Button size="sm" className="w-full gap-1.5" asChild>
            <a
              href={flightOfferUrl(offer)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open this flight on Skyscanner"
            >
              Select on Skyscanner <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}