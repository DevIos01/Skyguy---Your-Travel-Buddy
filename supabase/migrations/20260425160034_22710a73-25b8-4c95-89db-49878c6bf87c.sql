-- Wanderlush Holdings™ — mock hotels & rental cars catalog
-- Public-readable (this is a fake catalog, no user data); no writes from clients.

-- =========================================
-- HOTELS
-- =========================================
CREATE TABLE public.hotels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Wanderlush Stays',
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  area TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  rating NUMERIC(2,1) NOT NULL CHECK (rating BETWEEN 0 AND 5),
  reviews_count INTEGER NOT NULL DEFAULT 0,
  amenities TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  base_price_per_night NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotels_city ON public.hotels (LOWER(city));
CREATE INDEX idx_hotels_country ON public.hotels (LOWER(country));
CREATE INDEX idx_hotels_stars ON public.hotels (stars);
CREATE INDEX idx_hotels_rating ON public.hotels (rating);

CREATE TABLE public.hotel_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  rooms_available SMALLINT NOT NULL DEFAULT 0,
  price_per_night NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, date)
);

CREATE INDEX idx_hotel_availability_hotel_date ON public.hotel_availability (hotel_id, date);
CREATE INDEX idx_hotel_availability_date ON public.hotel_availability (date);

-- =========================================
-- RENTAL CARS
-- =========================================
CREATE TABLE public.rental_cars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Wanderlush Wheels',
  vehicle_class TEXT NOT NULL,
  transmission TEXT NOT NULL CHECK (transmission IN ('automatic','manual')),
  seats SMALLINT NOT NULL,
  doors SMALLINT NOT NULL,
  bags SMALLINT NOT NULL,
  image_url TEXT,
  features TEXT[] NOT NULL DEFAULT '{}',
  pickup_city TEXT NOT NULL,
  pickup_country TEXT NOT NULL,
  pickup_location_name TEXT NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  supplier TEXT NOT NULL,
  supplier_rating NUMERIC(2,1) NOT NULL CHECK (supplier_rating BETWEEN 0 AND 5),
  base_price_per_day NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rental_cars_city ON public.rental_cars (LOWER(pickup_city));
CREATE INDEX idx_rental_cars_country ON public.rental_cars (LOWER(pickup_country));
CREATE INDEX idx_rental_cars_class ON public.rental_cars (vehicle_class);
CREATE INDEX idx_rental_cars_transmission ON public.rental_cars (transmission);

CREATE TABLE public.rental_car_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id UUID NOT NULL REFERENCES public.rental_cars(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  units_available SMALLINT NOT NULL DEFAULT 0,
  price_per_day NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (car_id, date)
);

CREATE INDEX idx_rental_car_availability_car_date ON public.rental_car_availability (car_id, date);
CREATE INDEX idx_rental_car_availability_date ON public.rental_car_availability (date);

-- =========================================
-- updated_at triggers (re-using existing public.update_updated_at_column())
-- =========================================
CREATE TRIGGER hotels_set_updated_at
BEFORE UPDATE ON public.hotels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER rental_cars_set_updated_at
BEFORE UPDATE ON public.rental_cars
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RLS — public read-only catalog. No insert/update/delete from client.
-- Edge functions use the service role and bypass RLS for seeding/admin.
-- =========================================
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_car_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hotels are viewable by everyone"
  ON public.hotels FOR SELECT USING (true);

CREATE POLICY "Hotel availability is viewable by everyone"
  ON public.hotel_availability FOR SELECT USING (true);

CREATE POLICY "Rental cars are viewable by everyone"
  ON public.rental_cars FOR SELECT USING (true);

CREATE POLICY "Rental car availability is viewable by everyone"
  ON public.rental_car_availability FOR SELECT USING (true);
