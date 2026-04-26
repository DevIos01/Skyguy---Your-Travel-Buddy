import { Star, MapPin, Wifi, Coffee, Heart, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { HotelOffer } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hotelSearchUrl } from "@/lib/skyscanner";
import { formatConverted } from "@/lib/currency";
import { useUserCurrency } from "@/hooks/useUserCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const badgeStyles: Record<string, string> = {
  "Top rated": "bg-primary-soft text-primary",
  "Best value": "bg-success-soft text-success",
  "Popular": "bg-accent-soft text-accent",
};

export function HotelCard({ offer }: { offer: HotelOffer }) {
  const total = offer.totalPrice ?? offer.pricePerNight * offer.totalNights;
  const isUrl = typeof offer.image === "string" && offer.image.startsWith("http");
  const { user } = useAuth();
  const userCurrency = useUserCurrency();
  const converted = userCurrency.toUpperCase() !== (offer.currency || "EUR").toUpperCase();
  const [favorited, setFavorited] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hotel ids from Wanderlush are real UUIDs from the DB. Skip favorite logic for non-UUID ids (e.g. Skyscanner placeholders).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offer.id);

  useEffect(() => {
    if (!user || !isUuid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("favorite_hotels")
        .select("id")
        .eq("hotel_id", offer.id)
        .maybeSingle();
      if (!cancelled) setFavorited(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, offer.id, isUuid]);

  const toggleFavorite = async () => {
    if (!user || !isUuid || busy) return;
    setBusy(true);
    if (favorited) {
      const { error } = await supabase.from("favorite_hotels").delete().eq("hotel_id", offer.id);
      setBusy(false);
      if (error) {
        toast({ title: "Couldn't remove favorite", description: error.message, variant: "destructive" });
        return;
      }
      setFavorited(false);
    } else {
      const { error } = await supabase
        .from("favorite_hotels")
        .upsert({ user_id: user.id, hotel_id: offer.id }, { onConflict: "user_id,hotel_id" });
      setBusy(false);
      if (error) {
        toast({ title: "Couldn't save favorite", description: error.message, variant: "destructive" });
        return;
      }
      setFavorited(true);
      toast({ title: "Saved to favorites", description: offer.name });
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 sm:flex-row">
      {/* Image / placeholder */}
      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-gradient-sky text-5xl sm:h-auto sm:w-44 sm:shrink-0">
        {isUrl ? (
          <img src={offer.image} alt={offer.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden>{offer.image}</span>
        )}
        {isUuid && (
          <button
            aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
            aria-pressed={favorited}
            onClick={toggleFavorite}
            disabled={busy}
            className={cn(
              "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-transform hover:scale-105 disabled:opacity-60",
              favorited ? "text-primary" : "text-foreground",
            )}
          >
            <Heart className={cn("h-4 w-4", favorited && "fill-current")} />
          </button>
        )}
        {offer.badge && (
          <span className={cn("absolute left-2 top-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", badgeStyles[offer.badge])}>
            {offer.badge}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold text-foreground">{offer.name}</h4>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {offer.area}{offer.distanceFromCenter ? ` · ${offer.distanceFromCenter}` : ""}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xl font-bold tabular-nums text-foreground leading-tight">
                {formatConverted(offer.pricePerNight, offer.currency, userCurrency)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                per night{converted ? " · indicative" : ""}
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
              <Star className="h-3 w-3 fill-current" />
              {offer.rating.toFixed(1)}
            </div>
            <span className="text-xs text-muted-foreground">
              {offer.reviews.toLocaleString()} reviews
            </span>
          </div>

          <ul className="mt-3 flex flex-wrap gap-1.5">
            {offer.amenities.slice(0, 4).map((a) => (
              <li
                key={a}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {a === "Free WiFi" && <Wifi className="h-3 w-3" />}
                {a === "Breakfast" && <Coffee className="h-3 w-3" />}
                {a}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div>
            <p className="text-[11px] text-muted-foreground">
              Total · {offer.totalNights} nights
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {formatConverted(total, offer.currency, userCurrency)}
            </p>
          </div>
          <Button size="sm" className="gap-1.5" asChild>
            <a
              href={hotelSearchUrl(offer.name, offer.area)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${offer.name} on Skyscanner`}
            >
              View deal <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}