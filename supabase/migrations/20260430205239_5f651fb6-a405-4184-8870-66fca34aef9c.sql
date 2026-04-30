CREATE TABLE IF NOT EXISTS public.musicbrainz_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_musicbrainz_cache_key ON public.musicbrainz_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_musicbrainz_cache_expires ON public.musicbrainz_cache(expires_at);

ALTER TABLE public.musicbrainz_cache ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated. Service role bypasses RLS.