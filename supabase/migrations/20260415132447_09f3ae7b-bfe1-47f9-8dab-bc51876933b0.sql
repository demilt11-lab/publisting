
-- 1. Artist Trending Metrics
CREATE TABLE public.artist_trending_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_streams bigint DEFAULT 0,
  stream_velocity float DEFAULT 0,
  regional_growth jsonb DEFAULT '{}'::jsonb,
  genre_shift_score float DEFAULT 0,
  social_mentions int DEFAULT 0,
  tiktok_sound_uses int DEFAULT 0,
  youtube_views bigint DEFAULT 0,
  breakout_probability float DEFAULT 0,
  trending_regions text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_trending_metrics_person ON public.artist_trending_metrics(person_id, date DESC);
CREATE INDEX idx_trending_metrics_breakout ON public.artist_trending_metrics(breakout_probability DESC) WHERE breakout_probability > 0.5;

ALTER TABLE public.artist_trending_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trending metrics"
  ON public.artist_trending_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert trending metrics"
  ON public.artist_trending_metrics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update trending metrics"
  ON public.artist_trending_metrics FOR UPDATE TO authenticated USING (true);

-- 2. Trend Predictions
CREATE TABLE public.trend_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  prediction_type text NOT NULL,
  confidence_score float DEFAULT 0,
  predicted_date date,
  predicted_value jsonb DEFAULT '{}'::jsonb,
  reasoning text,
  created_at timestamptz DEFAULT now(),
  realized boolean DEFAULT false,
  actual_date date
);

CREATE INDEX idx_predictions_person ON public.trend_predictions(person_id, created_at DESC);
CREATE INDEX idx_predictions_type ON public.trend_predictions(prediction_type, confidence_score DESC);

ALTER TABLE public.trend_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read predictions"
  ON public.trend_predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert predictions"
  ON public.trend_predictions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update predictions"
  ON public.trend_predictions FOR UPDATE TO authenticated USING (true);

-- 3. Pipeline Activities
CREATE TABLE public.pipeline_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES public.watchlist_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pipeline_activities_entry ON public.pipeline_activities(entry_id, created_at DESC);

ALTER TABLE public.pipeline_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read pipeline activities"
  ON public.pipeline_activities FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can insert pipeline activities"
  ON public.pipeline_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND auth.uid() = created_by);

-- 4. Deal Likelihood Scores
CREATE TABLE public.deal_likelihood_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES public.watchlist_entries(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  score float DEFAULT 0,
  factors jsonb DEFAULT '{}'::jsonb,
  suggested_action text,
  next_best_action_date date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_deal_scores_entry ON public.deal_likelihood_scores(entry_id, created_at DESC);
CREATE INDEX idx_deal_scores_score ON public.deal_likelihood_scores(score DESC);

ALTER TABLE public.deal_likelihood_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read deal scores"
  ON public.deal_likelihood_scores FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can insert deal scores"
  ON public.deal_likelihood_scores FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id));

-- 5. Catalog Valuations
CREATE TABLE public.catalog_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  valuation_date date NOT NULL DEFAULT CURRENT_DATE,
  total_value decimal(12,2) DEFAULT 0,
  methodology text NOT NULL DEFAULT 'income_approach',
  assumptions jsonb DEFAULT '{}'::jsonb,
  song_valuations jsonb DEFAULT '[]'::jsonb,
  confidence_interval jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_valuations_user ON public.catalog_valuations(user_id, valuation_date DESC);

ALTER TABLE public.catalog_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own valuations"
  ON public.catalog_valuations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own valuations"
  ON public.catalog_valuations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own valuations"
  ON public.catalog_valuations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own valuations"
  ON public.catalog_valuations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. Market Multiples (public reference data)
CREATE TABLE public.market_multiples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date,
  buyer text,
  seller text,
  genre text,
  catalog_size int,
  annual_revenue decimal(12,2),
  purchase_price decimal(12,2),
  multiple float,
  source text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.market_multiples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market multiples"
  ON public.market_multiples FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert market multiples"
  ON public.market_multiples FOR INSERT TO authenticated WITH CHECK (true);
