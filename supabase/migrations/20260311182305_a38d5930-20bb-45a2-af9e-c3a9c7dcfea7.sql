-- Trigger PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- Also fix the team_invites policy that references auth.users
DROP POLICY IF EXISTS "Users can view their own invites" ON public.team_invites;
CREATE POLICY "Users can view their own invites" ON public.team_invites
  FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));
