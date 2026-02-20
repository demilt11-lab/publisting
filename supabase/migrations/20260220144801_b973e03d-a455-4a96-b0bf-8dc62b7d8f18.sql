
CREATE TABLE public.streaming_stats_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '24 hours'::interval)
);

ALTER TABLE public.streaming_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read streaming stats cache"
ON public.streaming_stats_cache FOR SELECT USING (true);

CREATE POLICY "Anyone can insert streaming stats cache"
ON public.streaming_stats_cache FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update streaming stats cache"
ON public.streaming_stats_cache FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX idx_streaming_stats_cache_key ON public.streaming_stats_cache (cache_key);
CREATE INDEX idx_streaming_stats_cache_expires ON public.streaming_stats_cache (expires_at);
