
-- ML User Profiles: learned feature vectors per user
CREATE TABLE public.ml_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  genre_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  region_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  audio_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  popularity_min int DEFAULT 0,
  popularity_max int DEFAULT 100,
  total_searches int DEFAULT 0,
  total_watchlist_adds int DEFAULT 0,
  feature_vector jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.ml_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ml profile"
  ON public.ml_user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ml profile"
  ON public.ml_user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ml profile"
  ON public.ml_user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ml_user_profiles_updated_at
  BEFORE UPDATE ON public.ml_user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ML Song Candidates: enriched song pool
CREATE TABLE public.ml_song_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_key text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  spotify_url text,
  apple_url text,
  genre text[] DEFAULT '{}',
  region text,
  popularity int,
  tempo float,
  energy float,
  danceability float,
  valence float,
  acousticness float,
  instrumentalness float,
  unsigned_talent jsonb DEFAULT '[]'::jsonb,
  unsigned_count int DEFAULT 0,
  enriched_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(song_key)
);

CREATE INDEX idx_ml_song_candidates_genre ON public.ml_song_candidates USING GIN(genre);
CREATE INDEX idx_ml_song_candidates_region ON public.ml_song_candidates(region);
CREATE INDEX idx_ml_song_candidates_unsigned ON public.ml_song_candidates(unsigned_count) WHERE unsigned_count > 0;

ALTER TABLE public.ml_song_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read song candidates"
  ON public.ml_song_candidates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert song candidates"
  ON public.ml_song_candidates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update song candidates"
  ON public.ml_song_candidates FOR UPDATE
  TO authenticated
  USING (true);

-- ML Recommendations: pre-scored recommendations per user
CREATE TABLE public.ml_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_candidate_id uuid REFERENCES public.ml_song_candidates(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL,
  score float NOT NULL DEFAULT 0,
  collaborative_score float DEFAULT 0,
  content_score float DEFAULT 0,
  watchlist_score float DEFAULT 0,
  unsigned_score float DEFAULT 0,
  diversity_score float DEFAULT 0,
  reason jsonb DEFAULT '{}'::jsonb,
  unsigned_talent jsonb DEFAULT '[]'::jsonb,
  feedback text,
  shown_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours')
);

CREATE INDEX idx_ml_recommendations_user ON public.ml_recommendations(user_id, score DESC);
CREATE INDEX idx_ml_recommendations_expires ON public.ml_recommendations(expires_at);

ALTER TABLE public.ml_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own recommendations"
  ON public.ml_recommendations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recommendations"
  ON public.ml_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recommendations"
  ON public.ml_recommendations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recommendations"
  ON public.ml_recommendations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ML Feedback: explicit feedback signals
CREATE TABLE public.ml_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recommendation_id uuid REFERENCES public.ml_recommendations(id) ON DELETE SET NULL,
  song_key text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  feedback_type text NOT NULL,
  genre text,
  talent_role text,
  unsigned_talent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ml_feedback_user ON public.ml_feedback(user_id, created_at DESC);
CREATE INDEX idx_ml_feedback_type ON public.ml_feedback(user_id, feedback_type);

ALTER TABLE public.ml_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback"
  ON public.ml_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.ml_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
