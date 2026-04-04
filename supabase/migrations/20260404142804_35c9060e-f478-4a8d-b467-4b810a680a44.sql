
ALTER TABLE public.watchlist_entries ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS notes text;
