CREATE TABLE IF NOT EXISTS public.odesli_cache (
  cache_key text PRIMARY KEY,
  query_url text,
  query_title text,
  query_artist text,
  response jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.odesli_cache ENABLE ROW LEVEL SECURITY;

-- No client-side access; only edge functions (service role) read/write.
CREATE POLICY "No public read on odesli_cache" ON public.odesli_cache FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS idx_odesli_cache_expires_at ON public.odesli_cache (expires_at);