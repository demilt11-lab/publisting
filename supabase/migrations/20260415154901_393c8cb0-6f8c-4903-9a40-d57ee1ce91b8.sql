
-- 1. Data Conflicts table
CREATE TABLE public.data_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_title TEXT NOT NULL,
  song_artist TEXT NOT NULL,
  field_name TEXT NOT NULL,
  source_1 TEXT NOT NULL,
  value_1 TEXT NOT NULL,
  confidence_1 DOUBLE PRECISION DEFAULT 0,
  source_2 TEXT NOT NULL,
  value_2 TEXT NOT NULL,
  confidence_2 DOUBLE PRECISION DEFAULT 0,
  resolved_value TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'unresolved',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.data_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read conflicts"
  ON public.data_conflicts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert conflicts"
  ON public.data_conflicts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update conflicts"
  ON public.data_conflicts FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX idx_data_conflicts_status ON public.data_conflicts (status);
CREATE INDEX idx_data_conflicts_song ON public.data_conflicts (song_title, song_artist);

-- 2. Prediction Tracking table
CREATE TABLE public.prediction_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_type TEXT DEFAULT 'artist',
  predicted_value JSONB DEFAULT '{}'::jsonb,
  predicted_date DATE,
  actual_value JSONB,
  actual_date DATE,
  accuracy_percentage DOUBLE PRECISION,
  genre TEXT,
  region TEXT,
  notes TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own predictions"
  ON public.prediction_tracking FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own predictions"
  ON public.prediction_tracking FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own predictions"
  ON public.prediction_tracking FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_prediction_tracking_type ON public.prediction_tracking (prediction_type);
CREATE INDEX idx_prediction_tracking_user ON public.prediction_tracking (user_id);

-- 3. YouTube Content ID table
CREATE TABLE public.youtube_content_id (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_title TEXT NOT NULL,
  song_artist TEXT NOT NULL,
  video_count INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  estimated_revenue NUMERIC DEFAULT 0,
  claim_count INTEGER DEFAULT 0,
  top_videos JSONB DEFAULT '[]'::jsonb,
  cache_key TEXT UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_content_id ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read youtube data"
  ON public.youtube_content_id FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert youtube data"
  ON public.youtube_content_id FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update youtube data"
  ON public.youtube_content_id FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX idx_youtube_content_id_song ON public.youtube_content_id (song_title, song_artist);
CREATE INDEX idx_youtube_content_id_cache ON public.youtube_content_id (cache_key);
