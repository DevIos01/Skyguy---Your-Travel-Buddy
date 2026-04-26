ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS passport_country text,
  ADD COLUMN IF NOT EXISTS home_street text,
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS home_postal_code text,
  ADD COLUMN IF NOT EXISTS home_country text,
  ADD COLUMN IF NOT EXISTS ask_before_using_home_address boolean NOT NULL DEFAULT true;

-- Lengths to keep things sensible / prevent abuse
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_len CHECK (full_name IS NULL OR char_length(full_name) <= 120),
  ADD CONSTRAINT profiles_phone_len CHECK (phone IS NULL OR char_length(phone) <= 32),
  ADD CONSTRAINT profiles_passport_country_len CHECK (passport_country IS NULL OR char_length(passport_country) <= 80),
  ADD CONSTRAINT profiles_home_street_len CHECK (home_street IS NULL OR char_length(home_street) <= 200),
  ADD CONSTRAINT profiles_home_city_len CHECK (home_city IS NULL OR char_length(home_city) <= 120),
  ADD CONSTRAINT profiles_home_postal_len CHECK (home_postal_code IS NULL OR char_length(home_postal_code) <= 20),
  ADD CONSTRAINT profiles_home_country_len CHECK (home_country IS NULL OR char_length(home_country) <= 80);

-- Tighten the existing "viewable by everyone" policy on profiles —
-- personal contact / address info should not leak to anonymous visitors.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Auto-update updated_at on profile edits
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();