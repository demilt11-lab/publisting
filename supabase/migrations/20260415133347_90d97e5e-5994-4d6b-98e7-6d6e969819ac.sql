
-- Competitor signings tracker
CREATE TABLE public.competitor_signings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_type text NOT NULL DEFAULT 'writer',
  competitor_name text NOT NULL,
  deal_date date,
  estimated_value_range text,
  genre text,
  news_source_url text,
  notes text,
  watchlist_entry_id uuid REFERENCES public.watchlist_entries(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_signings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view competitor signings"
  ON public.competitor_signings FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert competitor signings"
  ON public.competitor_signings FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id) AND auth.uid() = created_by);

CREATE POLICY "Team members can update competitor signings"
  ON public.competitor_signings FOR UPDATE
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can delete competitor signings"
  ON public.competitor_signings FOR DELETE
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE INDEX idx_competitor_signings_team ON public.competitor_signings(team_id);
CREATE INDEX idx_competitor_signings_competitor ON public.competitor_signings(competitor_name);

-- Saved search presets
CREATE TABLE public.saved_search_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  regions text[] DEFAULT '{}'::text[],
  is_shared boolean DEFAULT false,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_search_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own presets"
  ON public.saved_search_presets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared team presets"
  ON public.saved_search_presets FOR SELECT
  TO authenticated
  USING (is_shared = true AND team_id IS NOT NULL AND is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can insert own presets"
  ON public.saved_search_presets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
  ON public.saved_search_presets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
  ON public.saved_search_presets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Team activity feed (unified)
CREATE TABLE public.team_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action_type text NOT NULL,
  target_type text,
  target_name text,
  target_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  mentions uuid[] DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view activity feed"
  ON public.team_activity_feed FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert activity"
  ON public.team_activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id) AND auth.uid() = actor_id);

CREATE INDEX idx_team_activity_feed_team ON public.team_activity_feed(team_id, created_at DESC);
CREATE INDEX idx_team_activity_feed_mentions ON public.team_activity_feed USING GIN(mentions);

-- Enable realtime for activity feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_activity_feed;
