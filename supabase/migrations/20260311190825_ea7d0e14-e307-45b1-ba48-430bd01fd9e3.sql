
CREATE TABLE public.recommendation_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recommendation_title text NOT NULL,
  recommendation_artist text NOT NULL,
  unsigned_talent text,
  talent_role text,
  genre text,
  interaction_type text NOT NULL DEFAULT 'click',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recommendation_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own interactions"
  ON public.recommendation_interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own interactions"
  ON public.recommendation_interactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_rec_interactions_user ON public.recommendation_interactions(user_id, created_at DESC);
