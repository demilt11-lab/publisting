-- Tighten new canonical entity write policies (admin/moderator only).
DROP POLICY IF EXISTS "Auth writes playlists" ON public.playlists;
DROP POLICY IF EXISTS "Auth updates playlists" ON public.playlists;
CREATE POLICY "Mods write playlists" ON public.playlists FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "Mods update playlists" ON public.playlists FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

DROP POLICY IF EXISTS "Auth writes publishers" ON public.publishers;
DROP POLICY IF EXISTS "Auth updates publishers" ON public.publishers;
CREATE POLICY "Mods write publishers" ON public.publishers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "Mods update publishers" ON public.publishers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

DROP POLICY IF EXISTS "Auth writes labels" ON public.labels;
DROP POLICY IF EXISTS "Auth updates labels" ON public.labels;
CREATE POLICY "Mods write labels" ON public.labels FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "Mods update labels" ON public.labels FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

DROP POLICY IF EXISTS "Auth writes works" ON public.works;
DROP POLICY IF EXISTS "Auth updates works" ON public.works;
CREATE POLICY "Mods write works" ON public.works FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "Mods update works" ON public.works FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- Restrict change_summaries inserts to authenticated callers via service or admin/mod
DROP POLICY IF EXISTS "Auth writes change_summaries" ON public.change_summaries;
CREATE POLICY "Mods/admins write change_summaries" ON public.change_summaries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));