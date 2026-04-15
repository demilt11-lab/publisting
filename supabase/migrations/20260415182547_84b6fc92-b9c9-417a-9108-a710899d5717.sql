
-- Create decay_curves table for genre-specific forecast modeling
CREATE TABLE public.decay_curves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  genre TEXT NOT NULL UNIQUE,
  year1_weight DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  year2_weight DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  year3_weight DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.decay_curves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read decay curves"
  ON public.decay_curves FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert decay curves"
  ON public.decay_curves FOR INSERT TO authenticated
  WITH CHECK (true);

-- Pre-populate genre decay profiles
INSERT INTO public.decay_curves (genre, year1_weight, year2_weight, year3_weight, description) VALUES
  ('hip-hop', 0.70, 0.20, 0.10, 'Front-loaded decay typical of hip-hop releases'),
  ('pop', 0.50, 0.30, 0.20, 'Moderate decay for mainstream pop'),
  ('catalog', 0.35, 0.33, 0.32, 'Evergreen catalog with minimal decay'),
  ('classic', 0.35, 0.33, 0.32, 'Classic tracks with steady long-term performance'),
  ('punjabi', 0.60, 0.25, 0.15, 'Regional market with moderate front-loading'),
  ('electronic', 0.55, 0.28, 0.17, 'Electronic/dance music decay pattern'),
  ('r&b', 0.50, 0.30, 0.20, 'R&B with moderate staying power'),
  ('country', 0.45, 0.32, 0.23, 'Country music with strong catalog performance'),
  ('latin', 0.55, 0.28, 0.17, 'Latin music decay pattern'),
  ('rock', 0.40, 0.32, 0.28, 'Rock with strong catalog longevity'),
  ('default', 0.50, 0.30, 0.20, 'Default decay curve for unclassified genres');

CREATE TRIGGER update_decay_curves_updated_at
  BEFORE UPDATE ON public.decay_curves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
