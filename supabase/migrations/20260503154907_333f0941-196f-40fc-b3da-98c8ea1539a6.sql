CREATE TABLE IF NOT EXISTS public.social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  handle text NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  avatar_hd_url text,
  followers bigint,
  following bigint,
  posts bigint,
  is_verified boolean,
  is_business boolean,
  external_link text,
  raw_response jsonb NOT NULL,
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_profiles_platform_handle_key
  ON public.social_profiles (platform, handle);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read social profiles"
  ON public.social_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage social profiles"
  ON public.social_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
