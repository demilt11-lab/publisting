
-- Streaming rates by platform and country
CREATE TABLE public.streaming_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  country_code text NOT NULL,
  region text,
  rate_per_stream decimal(10,8) NOT NULL,
  currency text DEFAULT 'USD',
  effective_from date NOT NULL,
  effective_to date,
  quarter text NOT NULL,
  source text,
  verified boolean DEFAULT false,
  last_verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.streaming_rates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_streaming_rates_active ON streaming_rates(platform, country_code) WHERE effective_to IS NULL;
CREATE INDEX idx_streaming_rates_quarter ON streaming_rates(quarter);
CREATE INDEX idx_streaming_rates_lookup ON streaming_rates(platform, country_code, effective_from);

CREATE POLICY "Anyone can read streaming rates" ON public.streaming_rates FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert streaming rates" ON public.streaming_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update streaming rates" ON public.streaming_rates FOR UPDATE TO authenticated USING (true);

-- Audit log for rate changes
CREATE TABLE public.streaming_rate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  streaming_rate_id uuid REFERENCES public.streaming_rates(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_rate decimal(10,8),
  new_rate decimal(10,8),
  changed_by uuid,
  change_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.streaming_rate_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rate audit" ON public.streaming_rate_audit FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert rate audit" ON public.streaming_rate_audit FOR INSERT TO authenticated WITH CHECK (true);
