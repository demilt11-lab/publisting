CREATE TABLE IF NOT EXISTS public.spotify_artist_cache (
  spotify_artist_id text PRIMARY KEY,
  followers integer,
  popularity integer,
  display_name text,
  image_url text,
  genres text[],
  external_url text,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours')
);

ALTER TABLE public.spotify_artist_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public read on spotify_artist_cache"
  ON public.spotify_artist_cache FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS idx_spotify_artist_cache_expires_at
  ON public.spotify_artist_cache (expires_at);