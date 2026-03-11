-- Allow authenticated users to read beta signups (for admin dashboard)
CREATE POLICY "Authenticated users can view signups"
  ON public.beta_signups FOR SELECT TO authenticated
  USING (true);
