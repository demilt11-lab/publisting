ALTER TABLE public.watchlist_entries
ADD COLUMN IF NOT EXISTS lane_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.watchlist_entries.lane_history IS 'Array of {status, enteredAt} entries tracking when the entry entered each pipeline lane.';