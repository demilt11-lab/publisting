
-- Create streaming_velocity table for trend detection
CREATE TABLE public.streaming_velocity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_key TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_streams BIGINT DEFAULT 0,
  weekly_streams BIGINT DEFAULT 0,
  weekly_change_pct DOUBLE PRECISION DEFAULT 0,
  velocity_type TEXT DEFAULT 'normal',
  annotations JSONB DEFAULT '[]'::jsonb,
  platform TEXT DEFAULT 'spotify',
  region TEXT DEFAULT 'Global',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(song_key, date, platform)
);

ALTER TABLE public.streaming_velocity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read velocity data"
  ON public.streaming_velocity FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert velocity data"
  ON public.streaming_velocity FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update velocity data"
  ON public.streaming_velocity FOR UPDATE TO authenticated USING (true);

-- Create artist_aliases table for fuzzy search
CREATE TABLE public.artist_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  alias_name_lower TEXT GENERATED ALWAYS AS (lower(alias_name)) STORED,
  alias_type TEXT NOT NULL DEFAULT 'aka',
  source TEXT DEFAULT 'manual',
  confidence DOUBLE PRECISION DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(person_id, alias_name_lower)
);

ALTER TABLE public.artist_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read aliases"
  ON public.artist_aliases FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert aliases"
  ON public.artist_aliases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update aliases"
  ON public.artist_aliases FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete aliases"
  ON public.artist_aliases FOR DELETE TO authenticated USING (true);

-- Index for fuzzy search performance
CREATE INDEX idx_artist_aliases_name_lower ON public.artist_aliases(alias_name_lower);
CREATE INDEX idx_streaming_velocity_song_key ON public.streaming_velocity(song_key, date DESC);
CREATE INDEX idx_streaming_velocity_type ON public.streaming_velocity(velocity_type) WHERE velocity_type != 'normal';
