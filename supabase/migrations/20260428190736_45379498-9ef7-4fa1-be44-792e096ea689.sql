-- Distributor imports (one per CSV upload)
CREATE TABLE public.distributor_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  distributor_name TEXT NOT NULL,
  file_name TEXT,
  period_start DATE,
  period_end DATE,
  row_count INTEGER NOT NULL DEFAULT 0,
  total_streams BIGINT NOT NULL DEFAULT 0,
  total_earnings NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  raw_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.distributor_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own distributor imports" ON public.distributor_imports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own distributor imports" ON public.distributor_imports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own distributor imports" ON public.distributor_imports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own distributor imports" ON public.distributor_imports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_distributor_imports_updated_at
  BEFORE UPDATE ON public.distributor_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_distributor_imports_user ON public.distributor_imports(user_id, created_at DESC);

-- Per-row earnings
CREATE TABLE public.distributor_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.distributor_imports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  track_title TEXT,
  artist TEXT,
  isrc TEXT,
  upc TEXT,
  platform TEXT,
  country TEXT,
  streams BIGINT NOT NULL DEFAULT 0,
  earnings NUMERIC NOT NULL DEFAULT 0,
  currency TEXT,
  ownership_percent NUMERIC,
  period_start DATE,
  period_end DATE,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.distributor_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own distributor earnings" ON public.distributor_earnings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own distributor earnings" ON public.distributor_earnings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own distributor earnings" ON public.distributor_earnings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own distributor earnings" ON public.distributor_earnings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_distributor_earnings_import ON public.distributor_earnings(import_id);
CREATE INDEX idx_distributor_earnings_user ON public.distributor_earnings(user_id);
CREATE INDEX idx_distributor_earnings_isrc ON public.distributor_earnings(user_id, isrc) WHERE isrc IS NOT NULL;
CREATE INDEX idx_distributor_earnings_title_artist ON public.distributor_earnings(user_id, lower(track_title), lower(artist));