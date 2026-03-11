
-- Allow team owners to update member roles
CREATE POLICY "Team owners can update members"
  ON public.team_members FOR UPDATE TO public
  USING (is_team_owner(auth.uid(), team_id))
  WITH CHECK (is_team_owner(auth.uid(), team_id));
