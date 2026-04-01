
-- Fix 1: Team membership bypass - require invite for self-joining
DROP POLICY IF EXISTS "Team owners can add members" ON public.team_members;

CREATE POLICY "Team owners can add members or invitees can accept"
ON public.team_members FOR INSERT TO public
WITH CHECK (
  is_team_owner(auth.uid(), team_id)
  OR
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.team_invites
      WHERE team_invites.team_id = team_members.team_id
        AND team_invites.email = (auth.jwt() ->> 'email')
    )
  )
);

-- Fix 2: Restrict beta_signups SELECT to remove broad authenticated read
DROP POLICY IF EXISTS "Authenticated users can view signups" ON public.beta_signups;

-- Fix 3: Restrict cache table writes to authenticated users only
-- streaming_stats_cache
DROP POLICY IF EXISTS "Anyone can insert streaming stats cache" ON public.streaming_stats_cache;
DROP POLICY IF EXISTS "Anyone can update streaming stats cache" ON public.streaming_stats_cache;
DROP POLICY IF EXISTS "Anyone can delete streaming stats cache" ON public.streaming_stats_cache;

CREATE POLICY "Authenticated users can insert streaming stats cache" ON public.streaming_stats_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update streaming stats cache" ON public.streaming_stats_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete streaming stats cache" ON public.streaming_stats_cache FOR DELETE TO authenticated USING (true);

-- mlc_shares_cache
DROP POLICY IF EXISTS "Anyone can insert MLC shares cache" ON public.mlc_shares_cache;
DROP POLICY IF EXISTS "Anyone can update MLC shares cache" ON public.mlc_shares_cache;
DROP POLICY IF EXISTS "Anyone can delete MLC shares cache" ON public.mlc_shares_cache;

CREATE POLICY "Authenticated users can insert MLC shares cache" ON public.mlc_shares_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update MLC shares cache" ON public.mlc_shares_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete MLC shares cache" ON public.mlc_shares_cache FOR DELETE TO authenticated USING (true);

-- chart_placements_cache
DROP POLICY IF EXISTS "Anyone can insert chart cache" ON public.chart_placements_cache;
DROP POLICY IF EXISTS "Anyone can update chart cache" ON public.chart_placements_cache;

CREATE POLICY "Authenticated users can insert chart cache" ON public.chart_placements_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update chart cache" ON public.chart_placements_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- radio_airplay_cache
DROP POLICY IF EXISTS "Anyone can insert radio cache" ON public.radio_airplay_cache;
DROP POLICY IF EXISTS "Anyone can update radio cache" ON public.radio_airplay_cache;

CREATE POLICY "Authenticated users can insert radio cache" ON public.radio_airplay_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update radio cache" ON public.radio_airplay_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- pro_cache
DROP POLICY IF EXISTS "Anyone can insert PRO cache" ON public.pro_cache;
DROP POLICY IF EXISTS "Anyone can update PRO cache" ON public.pro_cache;
DROP POLICY IF EXISTS "Anyone can delete PRO cache" ON public.pro_cache;

CREATE POLICY "Authenticated users can insert PRO cache" ON public.pro_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update PRO cache" ON public.pro_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete PRO cache" ON public.pro_cache FOR DELETE TO authenticated USING (true);

-- hunter_email_cache
DROP POLICY IF EXISTS "Anyone can insert hunter cache" ON public.hunter_email_cache;
DROP POLICY IF EXISTS "Anyone can update hunter cache" ON public.hunter_email_cache;

CREATE POLICY "Authenticated users can insert hunter cache" ON public.hunter_email_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update hunter cache" ON public.hunter_email_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
