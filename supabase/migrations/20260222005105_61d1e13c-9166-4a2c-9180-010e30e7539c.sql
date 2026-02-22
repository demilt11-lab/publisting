
-- Create MLC shares cache table
CREATE TABLE public.mlc_shares_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE public.mlc_shares_cache ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (cache is shared)
CREATE POLICY "Anyone can read MLC shares cache" ON public.mlc_shares_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can insert MLC shares cache" ON public.mlc_shares_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update MLC shares cache" ON public.mlc_shares_cache FOR UPDATE USING (true) WITH CHECK (true);
