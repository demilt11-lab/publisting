ALTER TABLE public.social_profiles
  ADD COLUMN IF NOT EXISTS artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL;

ALTER TABLE public.social_profiles
  DROP CONSTRAINT IF EXISTS social_profiles_single_owner_chk;

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_single_owner_chk
  CHECK (artist_id IS NULL OR publisher_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_social_profiles_artist_id
  ON public.social_profiles(artist_id);

CREATE INDEX IF NOT EXISTS idx_social_profiles_publisher_id
  ON public.social_profiles(publisher_id);
