-- Create a cache table for PRO lookups to speed up repeated searches
CREATE TABLE public.pro_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL GENERATED ALWAYS AS (LOWER(name)) STORED,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Create unique index on lowercase name for case-insensitive lookups
CREATE UNIQUE INDEX idx_pro_cache_name_lower ON public.pro_cache (name_lower);

-- Create index for expiry cleanup
CREATE INDEX idx_pro_cache_expires_at ON public.pro_cache (expires_at);

-- Enable Row Level Security (public read, service role write)
ALTER TABLE public.pro_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cached data (public API)
CREATE POLICY "Anyone can read PRO cache"
ON public.pro_cache
FOR SELECT
USING (true);

-- Allow service role to insert/update/delete (edge functions use service role)
CREATE POLICY "Service role can manage PRO cache"
ON public.pro_cache
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.pro_cache IS 'Cache for PRO lookup results to speed up repeated searches';