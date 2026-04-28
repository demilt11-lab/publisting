CREATE TABLE public.pro_manual_pastes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_title text NOT NULL,
  song_artist text,
  source text NOT NULL DEFAULT 'unknown',
  raw_paste text NOT NULL,
  parsed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pro_manual_pastes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pro pastes" ON public.pro_manual_pastes
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pro pastes" ON public.pro_manual_pastes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pro pastes" ON public.pro_manual_pastes
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own pro pastes" ON public.pro_manual_pastes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_pro_manual_pastes_user ON public.pro_manual_pastes(user_id, created_at DESC);

CREATE TRIGGER update_pro_manual_pastes_updated_at
BEFORE UPDATE ON public.pro_manual_pastes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();