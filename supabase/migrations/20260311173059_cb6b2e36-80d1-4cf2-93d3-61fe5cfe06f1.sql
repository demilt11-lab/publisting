
-- Watchlist entries: team-scoped pipeline tracking
CREATE TABLE public.watchlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  person_type TEXT NOT NULL DEFAULT 'writer',
  pro TEXT,
  ipi TEXT,
  is_major BOOLEAN,
  pipeline_status TEXT NOT NULL DEFAULT 'not_contacted',
  assigned_to_user_id UUID,
  created_by UUID NOT NULL,
  contact_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, person_name, person_type)
);

-- Sources for each watchlist entry (songs they appeared on)
CREATE TABLE public.watchlist_entry_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.watchlist_entries(id) ON DELETE CASCADE,
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity log for watchlist entries
CREATE TABLE public.watchlist_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.watchlist_entries(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.watchlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_entry_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_activity ENABLE ROW LEVEL SECURITY;

-- RLS: team members can CRUD watchlist_entries for their teams
CREATE POLICY "Team members can view watchlist entries"
  ON public.watchlist_entries FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert watchlist entries"
  ON public.watchlist_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND auth.uid() = created_by);

CREATE POLICY "Team members can update watchlist entries"
  ON public.watchlist_entries FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can delete watchlist entries"
  ON public.watchlist_entries FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

-- RLS: watchlist_entry_sources inherit from parent entry
CREATE POLICY "Team members can view entry sources"
  ON public.watchlist_entry_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.watchlist_entries e WHERE e.id = entry_id AND public.is_team_member(auth.uid(), e.team_id)));

CREATE POLICY "Team members can insert entry sources"
  ON public.watchlist_entry_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.watchlist_entries e WHERE e.id = entry_id AND public.is_team_member(auth.uid(), e.team_id)));

CREATE POLICY "Team members can delete entry sources"
  ON public.watchlist_entry_sources FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.watchlist_entries e WHERE e.id = entry_id AND public.is_team_member(auth.uid(), e.team_id)));

-- RLS: watchlist_activity
CREATE POLICY "Team members can view activity"
  ON public.watchlist_activity FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert activity"
  ON public.watchlist_activity FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND auth.uid() = user_id);
