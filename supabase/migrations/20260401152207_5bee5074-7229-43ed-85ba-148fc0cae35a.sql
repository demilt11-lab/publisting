
CREATE TABLE public.user_local_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_key text NOT NULL,
  data_value jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, data_key)
);

ALTER TABLE public.user_local_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backups" ON public.user_local_backups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backups" ON public.user_local_backups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backups" ON public.user_local_backups
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own backups" ON public.user_local_backups
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
