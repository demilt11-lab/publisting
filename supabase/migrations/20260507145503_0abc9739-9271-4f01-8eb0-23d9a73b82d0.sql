
-- Snapshots: time-series of raw TikTok signals per song
CREATE TABLE public.tiktok_viral_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  song_key TEXT GENERATED ALWAYS AS (lower(song_title) || '||' || lower(artist)) STORED,
  video_count INTEGER,
  unique_creators INTEGER,
  total_views BIGINT,
  total_likes BIGINT,
  top_creators JSONB DEFAULT '[]'::jsonb,
  raw_payload JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tvs_song_key_captured ON public.tiktok_viral_snapshots(song_key, captured_at DESC);

ALTER TABLE public.tiktok_viral_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tiktok snapshots"
  ON public.tiktok_viral_snapshots FOR SELECT TO authenticated USING (true);

-- Latest computed score per song
CREATE TABLE public.tiktok_viral_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  song_key TEXT GENERATED ALWAYS AS (lower(song_title) || '||' || lower(artist)) STORED,
  score NUMERIC(5,2) NOT NULL,
  trajectory TEXT NOT NULL DEFAULT 'steady',
  drivers JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  video_count INTEGER,
  unique_creators INTEGER,
  total_views BIGINT,
  total_likes BIGINT,
  weekly_change_pct NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (song_key)
);

CREATE INDEX idx_tvs_scores_score ON public.tiktok_viral_scores(score DESC, computed_at DESC);

ALTER TABLE public.tiktok_viral_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tiktok viral scores"
  ON public.tiktok_viral_scores FOR SELECT TO authenticated USING (true);
