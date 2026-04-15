
-- Add new columns to artist_trending_metrics
ALTER TABLE public.artist_trending_metrics
  ADD COLUMN IF NOT EXISTS playlist_velocity double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genre_momentum_score double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_velocity jsonb DEFAULT '{}'::jsonb;

-- Add new columns to catalog_valuations
ALTER TABLE public.catalog_valuations
  ADD COLUMN IF NOT EXISTS decay_factor double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concentration_risk double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geographic_score double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copyright_expiry_impact double precision DEFAULT 0;

-- Deal rooms table for secure per-deal collaboration
CREATE TABLE public.deal_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.watchlist_entries(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Deal Room',
  status text NOT NULL DEFAULT 'active',
  notes_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, team_id)
);

ALTER TABLE public.deal_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view deal rooms" ON public.deal_rooms
  FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can create deal rooms" ON public.deal_rooms
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id) AND auth.uid() = created_by);

CREATE POLICY "Team members can update deal rooms" ON public.deal_rooms
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can delete deal rooms" ON public.deal_rooms
  FOR DELETE TO authenticated USING (is_team_member(auth.uid(), team_id));

CREATE TRIGGER update_deal_rooms_updated_at
  BEFORE UPDATE ON public.deal_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lookalike searches table
CREATE TABLE public.lookalike_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_artist text NOT NULL,
  source_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lookalike_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own searches" ON public.lookalike_searches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own searches" ON public.lookalike_searches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own searches" ON public.lookalike_searches
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
