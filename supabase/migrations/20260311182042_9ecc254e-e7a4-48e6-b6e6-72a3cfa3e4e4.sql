
-- Fix teams table: drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Team owners can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Team owners can update teams" ON public.teams;

CREATE POLICY "Authenticated users can create teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team members can view their teams" ON public.teams
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), id));

CREATE POLICY "Team owners can delete teams" ON public.teams
  FOR DELETE TO authenticated
  USING (is_team_owner(auth.uid(), id));

CREATE POLICY "Team owners can update teams" ON public.teams
  FOR UPDATE TO authenticated
  USING (is_team_owner(auth.uid(), id));

-- Fix team_members table
DROP POLICY IF EXISTS "Team members can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can add members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can remove members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners can update members" ON public.team_members;

CREATE POLICY "Team members can view team members" ON public.team_members
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team owners can add members" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (is_team_owner(auth.uid(), team_id) OR auth.uid() = user_id);

CREATE POLICY "Team owners can remove members" ON public.team_members
  FOR DELETE TO authenticated
  USING (is_team_owner(auth.uid(), team_id) OR auth.uid() = user_id);

CREATE POLICY "Team owners can update members" ON public.team_members
  FOR UPDATE TO authenticated
  USING (is_team_owner(auth.uid(), team_id))
  WITH CHECK (is_team_owner(auth.uid(), team_id));

-- Fix team_invites table
DROP POLICY IF EXISTS "Team members can view invites" ON public.team_invites;
DROP POLICY IF EXISTS "Team owners can create invites" ON public.team_invites;
DROP POLICY IF EXISTS "Team owners can delete invites" ON public.team_invites;
DROP POLICY IF EXISTS "Users can view their own invites" ON public.team_invites;

CREATE POLICY "Team members can view invites" ON public.team_invites
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Users can view their own invites" ON public.team_invites
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Team owners can create invites" ON public.team_invites
  FOR INSERT TO authenticated
  WITH CHECK (is_team_owner(auth.uid(), team_id));

CREATE POLICY "Team owners can delete invites" ON public.team_invites
  FOR DELETE TO authenticated
  USING (is_team_owner(auth.uid(), team_id));

-- Fix team_favorites table
DROP POLICY IF EXISTS "Team members can add team favorites" ON public.team_favorites;
DROP POLICY IF EXISTS "Team members can delete team favorites" ON public.team_favorites;
DROP POLICY IF EXISTS "Team members can update team favorites" ON public.team_favorites;
DROP POLICY IF EXISTS "Team members can view team favorites" ON public.team_favorites;

CREATE POLICY "Team members can view team favorites" ON public.team_favorites
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can add team favorites" ON public.team_favorites
  FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id) AND auth.uid() = added_by);

CREATE POLICY "Team members can delete team favorites" ON public.team_favorites
  FOR DELETE TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can update team favorites" ON public.team_favorites
  FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));
