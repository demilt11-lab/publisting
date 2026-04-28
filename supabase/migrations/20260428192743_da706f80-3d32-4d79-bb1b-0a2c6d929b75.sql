-- 1) Match metadata on each distributor row
ALTER TABLE public.distributor_earnings
  ADD COLUMN IF NOT EXISTS matched_catalog_key TEXT,
  ADD COLUMN IF NOT EXISTS match_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS match_type TEXT;

CREATE INDEX IF NOT EXISTS idx_distributor_earnings_match
  ON public.distributor_earnings(matched_catalog_key);

-- 2) DSP canonical-ID table (Spotify is the truth)
CREATE TABLE public.dsp_canonical_ids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spotify_track_id TEXT NOT NULL UNIQUE,
  isrc TEXT,
  canonical_title TEXT,
  canonical_artist TEXT,
  apple_track_id TEXT,
  apple_url TEXT,
  youtube_video_id TEXT,
  youtube_url TEXT,
  deezer_track_id TEXT,
  deezer_url TEXT,
  tidal_track_id TEXT,
  tidal_url TEXT,
  amazon_url TEXT,
  soundcloud_url TEXT,
  pandora_url TEXT,
  page_url TEXT,
  source TEXT NOT NULL DEFAULT 'odesli',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dsp_canon_isrc ON public.dsp_canonical_ids(isrc);
CREATE INDEX idx_dsp_canon_apple ON public.dsp_canonical_ids(apple_track_id);
CREATE INDEX idx_dsp_canon_yt ON public.dsp_canonical_ids(youtube_video_id);
CREATE INDEX idx_dsp_canon_deezer ON public.dsp_canonical_ids(deezer_track_id);

ALTER TABLE public.dsp_canonical_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read dsp canonical" ON public.dsp_canonical_ids FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert dsp canonical" ON public.dsp_canonical_ids FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update dsp canonical" ON public.dsp_canonical_ids FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_dsp_canon_updated
  BEFORE UPDATE ON public.dsp_canonical_ids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();