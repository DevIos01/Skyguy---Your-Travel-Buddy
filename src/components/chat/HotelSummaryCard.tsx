import { TrendingDown, BarChart3, ExternalLink } from "lucide-react";
import type { HotelPriceSummary } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { hotelListSearchUrl } from "@/lib/skyscanner";
import { formatConverted } from "@/lib/currency";
import { useUserCurrency } from "@/hooks/useUserCurrency";

export function HotelSummaryCard({ summary }: { summary: HotelPriceSummary }) {
  const { destination, currency, cheapest, average, median, totalNights, starsBreakdown, checkInDate, checkOutDate, note } = summary;
  const dateLabel = checkInDate && checkOutDate ? `${checkInDate} → ${checkOutDate}` : `${totalNights} night${totalNights > 1 ? "s" : ""}`;
  const userCurrency = useUserCurrency();
  const fmt = (n: number | undefined): string =>
    n == null || !Number.isFinite(n) ? "—" : formatConverted(n, currency, userCurrency);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Indicative prices</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{destination}</p>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>
        <span className="rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">Estimated</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingDown className="h-3 w-3" /> Cheapest
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">{fmt(cheapest)}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <BarChart3 className="h-3 w-3" /> Average
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">{fmt(average)}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 p-2.5">
          <div className="text-[11px] text-muted-foreground">Median</div>
          <p className="mt-1 text-sm font-semibold text-foreground">{fmt(median)}</p>
        </div>
      </div>

      {starsBreakdown && starsBreakdown.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">By star rating (avg / night)</p>
          {starsBreakdown.map((s) => (
            <div key={s.stars} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
              <span className="text-foreground">{"★".repeat(s.stars)}<span className="text-muted-foreground">{"★".repeat(5 - s.stars)}</span></span>
              <span className="text-muted-foreground">cheapest <span className="font-medium text-foreground">{fmt(s.cheapest)}</span> · avg <span className="font-medium text-foreground">{fmt(s.average)}</span></span>
            </div>
          ))}
        </div>
      )}

      {note && <p className="mt-3 text-[11px] text-muted-foreground">{note}</p>}

      <Button asChild size="sm" variant="outline" className="mt-3 w-full">
        <a href={hotelListSearchUrl(destination)} target="_blank" rel="noopener noreferrer">
          See live prices on Skyscanner <ExternalLink className="ml-1.5 h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}
