
CREATE TABLE public.deal_scoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  streaming_weight integer NOT NULL DEFAULT 30,
  social_weight integer NOT NULL DEFAULT 20,
  catalog_depth_weight integer NOT NULL DEFAULT 15,
  deal_stage_weight integer NOT NULL DEFAULT 20,
  priority_weight integer NOT NULL DEFAULT 15,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.deal_scoring_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scoring settings" ON public.deal_scoring_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scoring settings" ON public.deal_scoring_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scoring settings" ON public.deal_scoring_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scoring settings" ON public.deal_scoring_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
