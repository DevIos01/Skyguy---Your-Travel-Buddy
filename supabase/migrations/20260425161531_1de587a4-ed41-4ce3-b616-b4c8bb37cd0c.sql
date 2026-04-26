-- Favorite hotels per user
CREATE TABLE public.favorite_hotels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, hotel_id)
);

CREATE INDEX idx_favorite_hotels_user ON public.favorite_hotels(user_id);

ALTER TABLE public.favorite_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON public.favorite_hotels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favorites"
  ON public.favorite_hotels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON public.favorite_hotels FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own favorites"
  ON public.favorite_hotels FOR UPDATE
  USING (auth.uid() = user_id);

-- Per-user travel preferences (used to bias AI suggestions)
CREATE TABLE public.user_travel_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  -- Flights
  preferred_cabin_class TEXT,                 -- economy / premium-economy / business / first
  direct_flights_only BOOLEAN NOT NULL DEFAULT false,
  max_stops SMALLINT,                         -- 0,1,2 ...
  preferred_airlines TEXT[] NOT NULL DEFAULT '{}',
  avoided_airlines TEXT[] NOT NULL DEFAULT '{}',
  -- Hotels
  min_hotel_stars SMALLINT,                   -- 1..5
  min_hotel_rating NUMERIC,                   -- 0..5
  preferred_hotel_amenities TEXT[] NOT NULL DEFAULT '{}',
  preferred_hotel_brands TEXT[] NOT NULL DEFAULT '{}',
  -- Cars
  preferred_car_transmission TEXT,            -- automatic / manual
  preferred_car_class TEXT,                   -- economy / suv / luxury ...
  min_car_seats SMALLINT,
  -- General
  default_adults SMALLINT NOT NULL DEFAULT 1,
  default_children SMALLINT NOT NULL DEFAULT 0,
  default_rooms SMALLINT NOT NULL DEFAULT 1,
  preferred_currency TEXT NOT NULL DEFAULT 'USD',
  home_city TEXT,
  budget_level TEXT,                          -- budget / mid / luxury
  notes TEXT,                                 -- free-form bias hints for the AI
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_travel_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.user_travel_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_travel_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_travel_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON public.user_travel_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_travel_preferences_updated_at
  BEFORE UPDATE ON public.user_travel_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();