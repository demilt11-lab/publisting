
-- Add new columns to catalog_analyses
ALTER TABLE public.catalog_analyses
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS catalog_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS results_json jsonb,
  ADD COLUMN IF NOT EXISTS song_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_publishing_estimated numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_available_to_collect numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_three_year_collectible numeric NOT NULL DEFAULT 0;

-- Migrate any existing data from old columns to new ones
UPDATE public.catalog_analyses SET config_json = config WHERE config != '{}'::jsonb;
UPDATE public.catalog_analyses SET results_json = results WHERE results != '{}'::jsonb;
