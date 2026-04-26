-- Fix mock travel inventory pricing: existing rows store USD-magnitude
-- numbers but tagged with the local currency (e.g. 171 JPY for a Tokyo
-- hotel). Scale every non-USD row by USD->local FX so the stored values
-- actually represent the local currency.

create temp table fx_usd_to_local (currency text primary key, rate numeric);
insert into fx_usd_to_local (currency, rate) values
  ('EUR', 0.93), ('GBP', 0.79), ('CHF', 0.88), ('JPY', 149), ('CNY', 7.1),
  ('AUD', 1.52), ('NZD', 1.64), ('CAD', 1.35), ('MXN', 17.2), ('BRL', 5.0), ('ARS', 900),
  ('CLP', 900), ('COP', 4000), ('PEN', 3.7),
  ('AED', 3.67), ('SAR', 3.75), ('QAR', 3.64), ('BHD', 0.38), ('KWD', 0.31), ('OMR', 0.385),
  ('INR', 83), ('PKR', 280), ('BDT', 110), ('LKR', 305), ('NPR', 133),
  ('THB', 36), ('VND', 24500), ('IDR', 15800), ('MYR', 4.7), ('SGD', 1.35), ('PHP', 56),
  ('KRW', 1370), ('TWD', 32), ('HKD', 7.8),
  ('TRY', 33), ('ILS', 3.7), ('EGP', 50), ('MAD', 10), ('ZAR', 18.5),
  ('DKK', 6.9), ('SEK', 10.6), ('NOK', 10.9), ('ISK', 139),
  ('PLN', 4.0), ('CZK', 23), ('HUF', 370), ('RON', 4.6), ('BGN', 1.82),
  ('RUB', 92), ('UAH', 41), ('BYN', 3.3),
  ('KES', 130), ('NGN', 1500);

-- Hotels: scale base price.
update public.hotels h
set base_price_per_night = round(h.base_price_per_night * fx.rate)
from fx_usd_to_local fx
where upper(h.currency) = fx.currency
  and h.base_price_per_night < fx.rate * 10; -- guard: only fix rows that look unscaled

-- Hotel availability rows.
update public.hotel_availability a
set price_per_night = round(a.price_per_night * fx.rate)
from public.hotels h, fx_usd_to_local fx
where a.hotel_id = h.id
  and upper(h.currency) = fx.currency
  and a.price_per_night < fx.rate * 10;

-- Rental cars: scale base price.
update public.rental_cars c
set base_price_per_day = round(c.base_price_per_day * fx.rate)
from fx_usd_to_local fx
where upper(c.currency) = fx.currency
  and c.base_price_per_day < fx.rate * 10;

-- Rental car availability.
update public.rental_car_availability a
set price_per_day = round(a.price_per_day * fx.rate)
from public.rental_cars c, fx_usd_to_local fx
where a.car_id = c.id
  and upper(c.currency) = fx.currency
  and a.price_per_day < fx.rate * 10;