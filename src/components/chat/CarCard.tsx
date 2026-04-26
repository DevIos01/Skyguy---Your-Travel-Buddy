import { Star, Users, Briefcase, Cog, MapPin, ArrowRight } from "lucide-react";
import type { CarOffer } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatConverted } from "@/lib/currency";
import { useUserCurrency } from "@/hooks/useUserCurrency";

const badgeStyles: Record<string, string> = {
  "Cheapest": "bg-success-soft text-success",
  "Top rated": "bg-primary-soft text-primary",
  "Popular": "bg-accent-soft text-accent",
};

export function CarCard({ offer }: { offer: CarOffer }) {
  const isUrl = typeof offer.image === "string" && offer.image.startsWith("http");
  const userCurrency = useUserCurrency();
  const converted = userCurrency.toUpperCase() !== (offer.currency || "EUR").toUpperCase();
  const fmt = (n: number) => formatConverted(n, offer.currency, userCurrency);
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 sm:flex-row">
      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-gradient-sky text-5xl sm:h-auto sm:w-44 sm:shrink-0">
        {isUrl ? (
          <img src={offer.image} alt={offer.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden>{offer.image}</span>
        )}
        {offer.badge && (
          <span className={cn("absolute left-2 top-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", badgeStyles[offer.badge])}>
            {offer.badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold text-foreground">{offer.name}</h4>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {offer.pickupLocationName}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xl font-bold tabular-nums text-foreground leading-tight">{fmt(offer.pricePerDay)}</p>
              <p className="text-[11px] text-muted-foreground">per day{converted ? " · indicative" : ""}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 capitalize">{offer.vehicleClass.replace(/-/g, " ")}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 capitalize"><Cog className="h-3 w-3" />{offer.transmission}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><Users className="h-3 w-3" />{offer.seats}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><Briefcase className="h-3 w-3" />{offer.bags}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 font-semibold text-primary">
              <Star className="h-3 w-3 fill-current" />{offer.supplierRating.toFixed(1)}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">Supplier · <span className="font-medium text-foreground">{offer.supplier}</span></p>

          {offer.features.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {offer.features.slice(0, 4).map((f) => (
                <li key={f} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{f}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Total · {offer.totalDays} day{offer.totalDays > 1 ? "s" : ""}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(offer.totalPrice)}</p>
          </div>
          <Button size="sm" className="gap-1.5" disabled>
            Reserve <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
