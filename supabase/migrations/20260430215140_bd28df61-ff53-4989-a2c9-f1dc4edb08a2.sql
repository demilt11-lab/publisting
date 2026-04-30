-- ────────────────────────────────────────────────────────────────────
-- Phase 4: A&R Decision Platform
-- ────────────────────────────────────────────────────────────────────

-- 1. opportunity_scores -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('track','artist','writer','producer')),
  entity_key text NOT NULL,                 -- canonical_track key OR person name
  display_name text NOT NULL,
  primary_artist text,                      -- for tracks
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES public.canonical_artists(id) ON DELETE SET NULL,
  contributor_id uuid REFERENCES public.contributors(id) ON DELETE SET NULL,

  -- Composite + components (0-100)
  score numeric NOT NULL DEFAULT 0,
  momentum_component numeric NOT NULL DEFAULT 0,
  chart_component numeric NOT NULL DEFAULT 0,
  alert_velocity_component numeric NOT NULL DEFAULT 0,
  network_component numeric NOT NULL DEFAULT 0,
  signing_gap_component numeric NOT NULL DEFAULT 0,

  -- Lifecycle prediction
  lifecycle_state text NOT NULL DEFAULT 'stable'
    CHECK (lifecycle_state IN ('emerging','accelerating','peaking','stable','declining','dormant')),
  state_confidence numeric NOT NULL DEFAULT 0,

  -- Inputs / explanation
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text,
  data_points integer NOT NULL DEFAULT 0,

  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_opp_scores_score      ON public.opportunity_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_scores_type_score ON public.opportunity_scores (entity_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_scores_lifecycle  ON public.opportunity_scores (lifecycle_state, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_scores_entity_key ON public.opportunity_scores (entity_key);

ALTER TABLE public.opportunity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth reads opportunity scores"
  ON public.opportunity_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts opportunity scores"
  ON public.opportunity_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates opportunity scores"
  ON public.opportunity_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. automation_rules -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,

  -- Scope: rule belongs to a user or to a team (one of these set)
  owner_user_id uuid,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Trigger
  trigger_type text NOT NULL DEFAULT 'opportunity_score'
    CHECK (trigger_type IN ('opportunity_score','lifecycle_change','alert_event')),

  -- Conditions (JSON DSL evaluated by the runner)
  -- Examples:
  --   { "min_score": 70, "entity_types": ["writer","producer"], "lifecycle_in": ["emerging","accelerating"] }
  --   { "alert_kinds": ["spike"], "min_severity": "warn" }
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Action
  action_type text NOT NULL DEFAULT 'add_to_outreach'
    CHECK (action_type IN ('add_to_outreach','add_to_review','raise_alert','tag_priority')),
  action_params jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Throttling (don't re-fire for same entity within window)
  cooldown_hours integer NOT NULL DEFAULT 24,

  last_run_at timestamptz,
  fire_count integer NOT NULL DEFAULT 0,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_owner   ON public.automation_rules (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_team    ON public.automation_rules (team_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON public.automation_rules (trigger_type, enabled);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or team rules" ON public.automation_rules FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY "Create own or team rules" ON public.automation_rules FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (owner_user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))));
CREATE POLICY "Update own or team-owner rules" ON public.automation_rules FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_owner(auth.uid(), team_id)))
  WITH CHECK (owner_user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_owner(auth.uid(), team_id)));
CREATE POLICY "Delete own or team-owner rules" ON public.automation_rules FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_owner(auth.uid(), team_id)));

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. automation_runs --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  triggered_by text NOT NULL DEFAULT 'cron'
    CHECK (triggered_by IN ('cron','alert_event','manual')),
  entity_type text,
  entity_key text,
  display_name text,
  action_type text NOT NULL,
  action_status text NOT NULL DEFAULT 'success'
    CHECK (action_status IN ('success','skipped','error')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_rule     ON public.automation_runs (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_entity   ON public.automation_runs (entity_type, entity_key, created_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth reads automation runs" ON public.automation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts automation runs" ON public.automation_runs FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Trigger: dispatch automation runner on new alerts ----------------
CREATE OR REPLACE FUNCTION public.dispatch_automation_on_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text := 'https://oplzqmcptojaaknhkxoi.supabase.co/functions/v1/automation-runner';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wbHpxbWNwdG9qYWFrbmhreG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTU3NjYsImV4cCI6MjA4MzM3MTc2Nn0.-Hh7a6we7tXMK4ToeeT_yN4PWXdxv48mpbZrOKQHFf0';
BEGIN
  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type','application/json','apikey', anon_key),
    body := jsonb_build_object(
      'trigger','alert_event',
      'alert_id', NEW.id,
      'kind', NEW.kind,
      'severity', NEW.severity,
      'track_key', NEW.track_key
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block alert insertion if dispatch fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_automation_on_alert ON public.lookup_alerts;
CREATE TRIGGER trg_dispatch_automation_on_alert
  AFTER INSERT ON public.lookup_alerts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_automation_on_alert();