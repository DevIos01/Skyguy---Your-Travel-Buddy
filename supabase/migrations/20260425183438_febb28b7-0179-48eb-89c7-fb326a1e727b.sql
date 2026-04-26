-- Backfill 45 days of availability for hotels and cars that are missing it.
-- This bypasses the edge-function PostgREST 1000-row cap that prevented some
-- cities (Hamburg, etc.) from getting availability rows during seeding.

-- Hotel availability: for each hotel with zero existing availability rows,
-- generate 45 days of rows starting today, with a small weekend/seasonal price bump.
INSERT INTO public.hotel_availability (hotel_id, date, rooms_available, price_per_night)
SELECT
  h.id,
  d.date,
  CASE WHEN ((EXTRACT(DAY FROM d.date)::int * 17 + EXTRACT(MONTH FROM d.date)::int * 7) % 37) = 0
       THEN 0
       ELSE 2 + (((EXTRACT(DAY FROM d.date)::int * 17 + EXTRACT(MONTH FROM d.date)::int * 7) % 37) % 8)
  END AS rooms_available,
  ROUND(
    h.base_price_per_night
    * (1.0
       + CASE WHEN EXTRACT(DOW FROM d.date) IN (5, 6) THEN 0.18 ELSE 0 END
       + CASE WHEN EXTRACT(DOW FROM d.date) = 0 THEN 0.05 ELSE 0 END
       + CASE WHEN EXTRACT(MONTH FROM d.date) IN (7, 8) THEN 0.22 ELSE 0 END
       + CASE WHEN EXTRACT(MONTH FROM d.date) = 12 THEN 0.15 ELSE 0 END
      )::numeric
  , 2) AS price_per_night
FROM public.hotels h
CROSS JOIN LATERAL (
  SELECT (CURRENT_DATE + g)::date AS date
  FROM generate_series(0, 44) g
) d
WHERE NOT EXISTS (
  SELECT 1 FROM public.hotel_availability ha WHERE ha.hotel_id = h.id
);

-- Rental car availability: same pattern.
INSERT INTO public.rental_car_availability (car_id, date, units_available, price_per_day)
SELECT
  c.id,
  d.date,
  CASE WHEN ((EXTRACT(DAY FROM d.date)::int * 13 + EXTRACT(MONTH FROM d.date)::int * 5) % 31) = 0
       THEN 0
       ELSE 2 + (((EXTRACT(DAY FROM d.date)::int * 13 + EXTRACT(MONTH FROM d.date)::int * 5) % 31) % 6)
  END AS units_available,
  ROUND(
    c.base_price_per_day
    * (1.0
       + CASE WHEN EXTRACT(DOW FROM d.date) IN (5, 6) THEN 0.18 ELSE 0 END
       + CASE WHEN EXTRACT(DOW FROM d.date) = 0 THEN 0.05 ELSE 0 END
       + CASE WHEN EXTRACT(MONTH FROM d.date) IN (7, 8) THEN 0.22 ELSE 0 END
       + CASE WHEN EXTRACT(MONTH FROM d.date) = 12 THEN 0.15 ELSE 0 END
      )::numeric
  , 2) AS price_per_day
FROM public.rental_cars c
CROSS JOIN LATERAL (
  SELECT (CURRENT_DATE + g)::date AS date
  FROM generate_series(0, 44) g
) d
WHERE NOT EXISTS (
  SELECT 1 FROM public.rental_car_availability ra WHERE ra.car_id = c.id
);