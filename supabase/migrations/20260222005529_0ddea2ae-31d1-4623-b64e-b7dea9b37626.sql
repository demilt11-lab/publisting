
-- Teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_email TEXT,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team favorites (shared favorites list per team)
CREATE TABLE public.team_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  ipi TEXT,
  pro TEXT,
  publisher TEXT,
  added_by UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, name, role)
);

ALTER TABLE public.team_favorites ENABLE ROW LEVEL SECURITY;

-- Team invites (pending invitations)
CREATE TABLE public.team_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, email)
);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Chart placements cache
CREATE TABLE public.chart_placements_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.chart_placements_cache ENABLE ROW LEVEL SECURITY;

-- Security definer function to check team membership
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

-- Security definer function to check team ownership
CREATE OR REPLACE FUNCTION public.is_team_owner(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND role = 'owner'
  )
$$;

-- Teams RLS: members can view their teams
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  USING (public.is_team_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team owners can update teams"
  ON public.teams FOR UPDATE
  USING (public.is_team_owner(auth.uid(), id));

CREATE POLICY "Team owners can delete teams"
  ON public.teams FOR DELETE
  USING (public.is_team_owner(auth.uid(), id));

-- Team members RLS
CREATE POLICY "Team members can view team members"
  ON public.team_members FOR SELECT
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team owners can add members"
  ON public.team_members FOR INSERT
  WITH CHECK (public.is_team_owner(auth.uid(), team_id) OR auth.uid() = user_id);

CREATE POLICY "Team owners can remove members"
  ON public.team_members FOR DELETE
  USING (public.is_team_owner(auth.uid(), team_id) OR auth.uid() = user_id);

-- Team favorites RLS: any team member can CRUD
CREATE POLICY "Team members can view team favorites"
  ON public.team_favorites FOR SELECT
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can add team favorites"
  ON public.team_favorites FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND auth.uid() = added_by);

CREATE POLICY "Team members can update team favorites"
  ON public.team_favorites FOR UPDATE
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can delete team favorites"
  ON public.team_favorites FOR DELETE
  USING (public.is_team_member(auth.uid(), team_id));

-- Team invites RLS
CREATE POLICY "Team members can view invites"
  ON public.team_invites FOR SELECT
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team owners can create invites"
  ON public.team_invites FOR INSERT
  WITH CHECK (public.is_team_owner(auth.uid(), team_id));

CREATE POLICY "Team owners can delete invites"
  ON public.team_invites FOR DELETE
  USING (public.is_team_owner(auth.uid(), team_id));

-- Anyone can read invites by email (for accepting)
CREATE POLICY "Users can view their own invites"
  ON public.team_invites FOR SELECT
  USING (true);

-- Chart cache: public read/write
CREATE POLICY "Anyone can read chart cache"
  ON public.chart_placements_cache FOR SELECT USING (true);

CREATE POLICY "Anyone can insert chart cache"
  ON public.chart_placements_cache FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update chart cache"
  ON public.chart_placements_cache FOR UPDATE USING (true) WITH CHECK (true);
