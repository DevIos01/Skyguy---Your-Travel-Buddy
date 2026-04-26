ALTER TABLE public.user_travel_preferences
  ADD COLUMN IF NOT EXISTS baggage_preference TEXT,
  ADD COLUMN IF NOT EXISTS checked_bags SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_carry_on_weight_kg SMALLINT,
  ADD COLUMN IF NOT EXISTS prefer_no_long_layovers BOOLEAN NOT NULL DEFAULT false;