CREATE TABLE IF NOT EXISTS public.mb_normalization_cache (
  cache_key TEXT PRIMARY KEY,
  norm_title TEXT NOT NULL,
  norm_artist TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mb_normalization_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_mb_norm_cache"
  ON public.mb_normalization_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mb_norm_cache_updated_at
  ON public.mb_normalization_cache (updated_at DESC);