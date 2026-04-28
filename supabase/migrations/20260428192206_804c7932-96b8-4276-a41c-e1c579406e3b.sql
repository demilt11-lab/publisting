-- Spotify stream truth-source cache
CREATE TABLE public.spotify_stream_truth (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  song_title TEXT NOT NULL,
  song_artist TEXT,
  isrc TEXT,
  spotify_track_id TEXT,
  spotify_url TEXT,
  popularity INTEGER,
  stream_count BIGINT,
  is_exact BOOLEAN NOT NULL DEFAULT false,
  estimated_streams BIGINT,
  source TEXT NOT NULL DEFAULT 'pathfinder',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_spotify_stream_truth_user ON public.spotify_stream_truth(user_id);
CREATE INDEX idx_spotify_stream_truth_isrc ON public.spotify_stream_truth(isrc);
CREATE INDEX idx_spotify_stream_truth_track ON public.spotify_stream_truth(spotify_track_id);
CREATE INDEX idx_spotify_stream_truth_lookup ON public.spotify_stream_truth(user_id, lower(song_title), lower(coalesce(song_artist, '')));

ALTER TABLE public.spotify_stream_truth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own spotify truth" ON public.spotify_stream_truth FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own spotify truth" ON public.spotify_stream_truth FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own spotify truth" ON public.spotify_stream_truth FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own spotify truth" ON public.spotify_stream_truth FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_spotify_stream_truth_updated
  BEFORE UPDATE ON public.spotify_stream_truth
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Metadata normalization layer (workspace-shared cache keyed by canonical identifiers)
CREATE TABLE public.metadata_normalization (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,            -- normalized lookup key (isrc, iswc, or title+artist hash)
  input_title TEXT,
  input_artist TEXT,
  input_isrc TEXT,
  input_iswc TEXT,
  canonical_title TEXT,
  canonical_artist TEXT,
  isrc TEXT,
  iswc TEXT,
  spotify_track_id TEXT,
  mbid_recording TEXT,
  mbid_work TEXT,
  writer_ipis JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{ name, ipi, role }]
  publisher_ipis JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,        -- ["musicbrainz","spotify",...]
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_metanorm_isrc ON public.metadata_normalization(isrc);
CREATE INDEX idx_metanorm_iswc ON public.metadata_normalization(iswc);
CREATE INDEX idx_metanorm_spotify ON public.metadata_normalization(spotify_track_id);
CREATE INDEX idx_metanorm_mbid_rec ON public.metadata_normalization(mbid_recording);

ALTER TABLE public.metadata_normalization ENABLE ROW LEVEL SECURITY;

-- Workspace-wide cache: any authenticated user can read; only authenticated can upsert
CREATE POLICY "Authenticated read normalization" ON public.metadata_normalization FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert normalization" ON public.metadata_normalization FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update normalization" ON public.metadata_normalization FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_metanorm_updated
  BEFORE UPDATE ON public.metadata_normalization
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();