CREATE TABLE public.radio_airplay_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.radio_airplay_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read radio cache" ON public.radio_airplay_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can insert radio cache" ON public.radio_airplay_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update radio cache" ON public.radio_airplay_cache FOR UPDATE USING (true) WITH CHECK (true);