
ALTER TABLE public.recommendation_interactions
  ADD COLUMN IF NOT EXISTS pub_artist_id text,
  ADD COLUMN IF NOT EXISTS pub_track_id text,
  ADD COLUMN IF NOT EXISTS pub_creator_id text;

ALTER TABLE public.outreach_notes
  ADD COLUMN IF NOT EXISTS pub_artist_id text,
  ADD COLUMN IF NOT EXISTS pub_track_id text,
  ADD COLUMN IF NOT EXISTS pub_creator_id text;

CREATE TABLE IF NOT EXISTS public.saved_filter_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'discovery',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_filter_sets_user ON public.saved_filter_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_filter_sets_team ON public.saved_filter_sets(team_id);

ALTER TABLE public.saved_filter_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own filter sets" ON public.saved_filter_sets;
CREATE POLICY "Users manage own filter sets"
  ON public.saved_filter_sets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Team members read shared filter sets" ON public.saved_filter_sets;
CREATE POLICY "Team members read shared filter sets"
  ON public.saved_filter_sets
  FOR SELECT
  USING (
    team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)
  );

DROP TRIGGER IF EXISTS saved_filter_sets_updated_at ON public.saved_filter_sets;
CREATE TRIGGER saved_filter_sets_updated_at
  BEFORE UPDATE ON public.saved_filter_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
