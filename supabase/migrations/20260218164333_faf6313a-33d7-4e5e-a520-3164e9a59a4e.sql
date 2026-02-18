-- Add sort_order column to favorites for drag-to-reorder
ALTER TABLE public.favorites ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Set initial sort order based on created_at (most recent = 0, then incrementing)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1 AS rn
  FROM public.favorites
)
UPDATE public.favorites SET sort_order = ranked.rn FROM ranked WHERE public.favorites.id = ranked.id;