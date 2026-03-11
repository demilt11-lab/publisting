
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  signing_status_filter TEXT NOT NULL DEFAULT 'all',
  label_status_filter TEXT NOT NULL DEFAULT 'all',
  role_filter TEXT NOT NULL DEFAULT 'all',
  publishing_type_filter TEXT NOT NULL DEFAULT 'any',
  label_type_filter TEXT NOT NULL DEFAULT 'any',
  chart_filter TEXT NOT NULL DEFAULT 'any',
  genre_filter TEXT NOT NULL DEFAULT 'any',
  writers_count_filter TEXT NOT NULL DEFAULT 'any',
  admin_status_filter TEXT NOT NULL DEFAULT 'any',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
