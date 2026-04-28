CREATE TABLE IF NOT EXISTS public.youtube_credentials (
  user_id uuid PRIMARY KEY,
  api_key text NOT NULL,
  auto_lookup_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own YouTube creds"   ON public.youtube_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own YouTube creds" ON public.youtube_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own YouTube creds" ON public.youtube_credentials FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own YouTube creds" ON public.youtube_credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_youtube_credentials_updated_at
BEFORE UPDATE ON public.youtube_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
