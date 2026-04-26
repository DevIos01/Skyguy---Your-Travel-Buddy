import { useState } from "react";
import { Plane, BedDouble, ExternalLink, Car, ChevronDown, ChevronUp } from "lucide-react";
import type { ResultBlock } from "@/types/chat";
import { FlightCard } from "./FlightCard";
import { HotelCard } from "./HotelCard";
import { HotelSummaryCard } from "./HotelSummaryCard";
import { CarCard } from "./CarCard";
import { flightSearchUrl, hotelListSearchUrl } from "@/lib/skyscanner";

const TOP_VISIBLE = 2;

export function ResultsBlock({ block }: { block: ResultBlock }) {
  const [expanded, setExpanded] = useState(false);
  const Icon =
    block.kind === "flights" ? Plane :
    block.kind === "cars" ? Car :
    BedDouble;
  const label =
    block.kind === "flights"
      ? "Flight results"
      : block.kind === "hotels"
        ? "Hotel results"
        : block.kind === "cars"
          ? "Wanderlush Wheels · car rentals"
          : "Hotel price overview";
  const count =
    block.kind === "flights" || block.kind === "hotels" || block.kind === "cars" ? block.offers.length : 1;
  const viewAllUrl =
    block.kind === "flights"
      ? flightSearchUrl(block)
      : block.kind === "cars"
        ? "#"
        : hotelListSearchUrl(block.query);

  const isOfferList =
    block.kind === "flights" || block.kind === "hotels" || block.kind === "cars";
  const offers = isOfferList ? block.offers : [];
  const visibleOffers = expanded ? offers : offers.slice(0, TOP_VISIBLE);
  const hiddenCount = Math.max(0, offers.length - TOP_VISIBLE);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-secondary/40">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight">
              {label} · <span className="text-muted-foreground font-normal">{block.query}</span>
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {block.kind === "hotelSummary"
                ? "Indicative prices · live booking on Skyscanner"
                : `${count} option${count > 1 ? "s" : ""} · sorted by recommended`}
            </p>
          </div>
        </div>
        <a
          href={viewAllUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary-soft sm:inline-flex"
        >
          View all <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="space-y-3 p-3">
        {block.kind === "flights" &&
          visibleOffers.map((o) => <FlightCard key={o.id} offer={o as any} />)}
        {block.kind === "hotels" &&
          visibleOffers.map((o) => <HotelCard key={o.id} offer={o as any} />)}
        {block.kind === "cars" &&
          visibleOffers.map((o) => <CarCard key={o.id} offer={o as any} />)}
        {block.kind === "hotelSummary" && <HotelSummaryCard summary={block.summary} />}

        {isOfferList && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show fewer options
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show {hiddenCount} more option{hiddenCount > 1 ? "s" : ""}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}