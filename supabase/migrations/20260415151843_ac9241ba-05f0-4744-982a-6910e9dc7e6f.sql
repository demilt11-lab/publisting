
-- Add PRO affiliation columns to people table
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS pro_affiliation text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS territory_coverage jsonb DEFAULT '[]'::jsonb;

-- Catalog comparables table for Royalty Exchange data
CREATE TABLE IF NOT EXISTS public.catalog_comparables (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_name text NOT NULL,
  sale_date date,
  sale_price numeric,
  annual_revenue numeric,
  multiple double precision,
  genre text,
  song_count integer,
  source_url text,
  buyer text,
  seller text,
  source text DEFAULT 'royalty_exchange',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalog_comparables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read catalog comparables" ON public.catalog_comparables FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert catalog comparables" ON public.catalog_comparables FOR INSERT TO authenticated WITH CHECK (true);

-- Artist tour data table
CREATE TABLE IF NOT EXISTS public.artist_tour_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  upcoming_shows_count integer DEFAULT 0,
  avg_venue_capacity integer,
  touring_regions text[] DEFAULT '{}'::text[],
  last_tour_date date,
  next_show_date date,
  on_tour boolean DEFAULT false,
  raw_events jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.artist_tour_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read tour data" ON public.artist_tour_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert tour data" ON public.artist_tour_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tour data" ON public.artist_tour_data FOR UPDATE TO authenticated USING (true);

-- Soundcharts cache table
CREATE TABLE IF NOT EXISTS public.soundcharts_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
ALTER TABLE public.soundcharts_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read soundcharts cache" ON public.soundcharts_cache FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert soundcharts cache" ON public.soundcharts_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update soundcharts cache" ON public.soundcharts_cache FOR UPDATE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_catalog_comparables_genre ON public.catalog_comparables(genre);
CREATE INDEX IF NOT EXISTS idx_artist_tour_data_person ON public.artist_tour_data(person_id);
CREATE INDEX IF NOT EXISTS idx_artist_tour_data_name ON public.artist_tour_data(artist_name);
CREATE INDEX IF NOT EXISTS idx_soundcharts_cache_key ON public.soundcharts_cache(cache_key);
