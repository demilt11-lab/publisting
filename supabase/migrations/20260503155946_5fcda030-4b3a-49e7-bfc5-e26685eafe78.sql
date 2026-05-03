ALTER TABLE public.social_profiles
  ADD COLUMN IF NOT EXISTS last_fetch_status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS last_fetch_error text;