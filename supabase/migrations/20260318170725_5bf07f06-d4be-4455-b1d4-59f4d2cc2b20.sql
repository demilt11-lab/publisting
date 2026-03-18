-- Allow team creators to see their own teams (needed because AFTER INSERT trigger
-- hasn't yet added them to team_members when RETURNING clause evaluates)
CREATE POLICY "Creators can view their own teams"
ON public.teams
FOR SELECT
USING (auth.uid() = created_by);