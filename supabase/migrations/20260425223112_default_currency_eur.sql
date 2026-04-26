-- Switch the default currency for newly created user_travel_preferences rows
-- from USD to EUR. Existing rows keep whatever value they were saved with — we
-- only change the column default so new sign-ups land on EUR by default.
ALTER TABLE public.user_travel_preferences
  ALTER COLUMN preferred_currency SET DEFAULT 'EUR';
