import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Heart, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type Favorite = {
  id: string;
  hotel_id: string;
  note: string | null;
  created_at: string;
  hotels: {
    id: string;
    name: string;
    city: string;
    country: string;
    area: string | null;
    stars: number;
    rating: number;
    image_url: string | null;
  } | null;
};

export default function Favorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("favorite_hotels")
        .select("id, hotel_id, note, created_at, hotels(id, name, city, country, area, stars, rating, image_url)")
        .order("created_at", { ascending: false });
      setLoading(false);
      if (error) {
        toast({ title: "Couldn't load favorites", description: error.message, variant: "destructive" });
        return;
      }
      setFavorites((data as Favorite[]) ?? []);
    })();
  }, [user]);

  const remove = async (hotelId: string) => {
    const { error } = await supabase.from("favorite_hotels").delete().eq("hotel_id", hotelId);
    if (error) {
      toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.hotel_id !== hotelId));
  };

  return (
    <div className="min-h-screen bg-chat text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-chat/85 px-4 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to chat
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <Heart className="h-4 w-4 text-primary" />
            Favorite hotels
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">{favorites.length} saved</span>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 py-8 md:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading favorites…
          </div>
        ) : favorites.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No favorites yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap the heart on any hotel result in chat to save it here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {favorites.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {f.hotels?.image_url ? (
                    <img
                      src={f.hotels.image_url}
                      alt={f.hotels.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl">🏨</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.hotels?.name ?? "Hotel"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.hotels?.area ? `${f.hotels.area} · ` : ""}{f.hotels?.city}, {f.hotels?.country}
                    {f.hotels ? ` · ${f.hotels.stars}★ · ${f.hotels.rating.toFixed(1)}` : ""}
                  </p>
                  {f.note && <p className="mt-1 truncate text-xs italic text-muted-foreground">"{f.note}"</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(f.hotel_id)}
                  aria-label="Remove favorite"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}