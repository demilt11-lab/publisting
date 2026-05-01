
-- =====================================================
-- PHASE 5: OUTREACH CRM, COLLABORATION, REPORTS, LEARNING
-- =====================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.outreach_entity_type AS ENUM ('artist','writer','producer','track','catalog');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outreach_stage AS ENUM ('discovered','researching','contacted','meeting','negotiating','offer','signed','passed','dormant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outreach_status AS ENUM ('open','blocked','won','lost','on_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('open','in_progress','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.brief_kind AS ENUM ('artist','deal','portfolio','catalog','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_cadence AS ENUM ('daily','weekly','monthly','adhoc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.feedback_kind AS ENUM ('recommendation_accept','recommendation_reject','score_override','outreach_outcome','prediction_correction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- OUTREACH CRM
-- =====================================================
CREATE TABLE public.outreach_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  entity_type public.outreach_entity_type NOT NULL,
  entity_key text NOT NULL,
  entity_name text NOT NULL,
  entity_meta jsonb DEFAULT '{}'::jsonb,
  stage public.outreach_stage NOT NULL DEFAULT 'discovered',
  status public.outreach_status NOT NULL DEFAULT 'open',
  priority int NOT NULL DEFAULT 3,
  owner_id uuid,
  value_estimate numeric,
  next_action text,
  next_action_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, entity_type, entity_key)
);
CREATE INDEX idx_outreach_records_team ON public.outreach_records(team_id, stage, status);
CREATE INDEX idx_outreach_records_owner ON public.outreach_records(owner_id);
ALTER TABLE public.outreach_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read outreach"
  ON public.outreach_records FOR SELECT
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create outreach"
  ON public.outreach_records FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND created_by = auth.uid());
CREATE POLICY "Team members update outreach"
  ON public.outreach_records FOR UPDATE
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team owners or creators delete outreach"
  ON public.outreach_records FOR DELETE
  USING (public.is_team_owner(auth.uid(), team_id) OR created_by = auth.uid());

CREATE TRIGGER trg_outreach_records_updated
  BEFORE UPDATE ON public.outreach_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notes
CREATE TABLE public.outreach_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id uuid NOT NULL REFERENCES public.outreach_records(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_notes_outreach ON public.outreach_notes(outreach_id);
ALTER TABLE public.outreach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read notes"
  ON public.outreach_notes FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create notes"
  ON public.outreach_notes FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND author_id = auth.uid());
CREATE POLICY "Author or owner deletes notes"
  ON public.outreach_notes FOR DELETE USING (author_id = auth.uid() OR public.is_team_owner(auth.uid(), team_id));

-- Tasks
CREATE TABLE public.outreach_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id uuid REFERENCES public.outreach_records(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee_id uuid,
  due_at timestamptz,
  status public.task_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_tasks_team ON public.outreach_tasks(team_id, status);
CREATE INDEX idx_outreach_tasks_assignee ON public.outreach_tasks(assignee_id, status);
ALTER TABLE public.outreach_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read tasks"
  ON public.outreach_tasks FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members manage tasks"
  ON public.outreach_tasks FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND created_by = auth.uid());
CREATE POLICY "Team members update tasks"
  ON public.outreach_tasks FOR UPDATE USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Creator or owner deletes tasks"
  ON public.outreach_tasks FOR DELETE USING (created_by = auth.uid() OR public.is_team_owner(auth.uid(), team_id));

CREATE TRIGGER trg_outreach_tasks_updated
  BEFORE UPDATE ON public.outreach_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Status history (audit trail)
CREATE TABLE public.outreach_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id uuid NOT NULL REFERENCES public.outreach_records(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL,
  from_stage public.outreach_stage,
  to_stage public.outreach_stage,
  from_status public.outreach_status,
  to_status public.outreach_status,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_history_outreach ON public.outreach_status_history(outreach_id, created_at DESC);
ALTER TABLE public.outreach_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read history"
  ON public.outreach_status_history FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members write history"
  ON public.outreach_status_history FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND changed_by = auth.uid());

-- Auto-record stage/status changes
CREATE OR REPLACE FUNCTION public.log_outreach_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.stage IS DISTINCT FROM OLD.stage) OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.outreach_status_history(outreach_id, team_id, changed_by, from_stage, to_stage, from_status, to_status)
    VALUES (NEW.id, NEW.team_id, COALESCE(auth.uid(), NEW.created_by), OLD.stage, NEW.stage, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_outreach_status_history
  AFTER UPDATE ON public.outreach_records
  FOR EACH ROW EXECUTE FUNCTION public.log_outreach_status_change();

-- =====================================================
-- SHARED WATCHLISTS + COMMENTS
-- =====================================================
CREATE TABLE public.shared_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read watchlists" ON public.shared_watchlists FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create watchlists" ON public.shared_watchlists FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND created_by = auth.uid());
CREATE POLICY "Team members update watchlists" ON public.shared_watchlists FOR UPDATE USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Creator or owner deletes watchlists" ON public.shared_watchlists FOR DELETE USING (created_by = auth.uid() OR public.is_team_owner(auth.uid(), team_id));
CREATE TRIGGER trg_shared_watchlists_updated BEFORE UPDATE ON public.shared_watchlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.shared_watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.shared_watchlists(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  entity_type public.outreach_entity_type NOT NULL,
  entity_key text NOT NULL,
  entity_name text NOT NULL,
  entity_meta jsonb DEFAULT '{}'::jsonb,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(watchlist_id, entity_type, entity_key)
);
CREATE INDEX idx_swi_watchlist ON public.shared_watchlist_items(watchlist_id);
ALTER TABLE public.shared_watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read items" ON public.shared_watchlist_items FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members add items" ON public.shared_watchlist_items FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND added_by = auth.uid());
CREATE POLICY "Team members remove items" ON public.shared_watchlist_items FOR DELETE USING (public.is_team_member(auth.uid(), team_id));

-- Comments (polymorphic)
CREATE TABLE public.collab_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_collab_comments_target ON public.collab_comments(team_id, target_type, target_id);
ALTER TABLE public.collab_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read comments" ON public.collab_comments FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create comments" ON public.collab_comments FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND author_id = auth.uid());
CREATE POLICY "Author or owner deletes comments" ON public.collab_comments FOR DELETE USING (author_id = auth.uid() OR public.is_team_owner(auth.uid(), team_id));

-- Decision logs
CREATE TABLE public.decision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  entity_type public.outreach_entity_type NOT NULL,
  entity_key text NOT NULL,
  entity_name text NOT NULL,
  decision text NOT NULL,
  rationale text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_decision_logs_team ON public.decision_logs(team_id, decided_at DESC);
ALTER TABLE public.decision_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read decisions" ON public.decision_logs FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create decisions" ON public.decision_logs FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND decided_by = auth.uid());
CREATE POLICY "Owner deletes decisions" ON public.decision_logs FOR DELETE USING (public.is_team_owner(auth.uid(), team_id));

-- =====================================================
-- BRIEFS + RECURRING REPORTS
-- =====================================================
CREATE TABLE public.briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  kind public.brief_kind NOT NULL,
  title text NOT NULL,
  subject_type public.outreach_entity_type,
  subject_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_briefs_team ON public.briefs(team_id, created_at DESC);
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read briefs" ON public.briefs FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members create briefs" ON public.briefs FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND generated_by = auth.uid());
CREATE POLICY "Owner or author deletes briefs" ON public.briefs FOR DELETE USING (generated_by = auth.uid() OR public.is_team_owner(auth.uid(), team_id));

CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  cadence public.report_cadence NOT NULL,
  source_kinds text[] NOT NULL DEFAULT '{lookup,chart,alert,portfolio}',
  filters jsonb DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_schedules_team ON public.report_schedules(team_id);
CREATE INDEX idx_report_schedules_next ON public.report_schedules(enabled, next_run_at);
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read schedules" ON public.report_schedules FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members manage schedules" ON public.report_schedules FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id) AND created_by = auth.uid());
CREATE POLICY "Team members update schedules" ON public.report_schedules FOR UPDATE USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Creator or owner deletes schedules" ON public.report_schedules FOR DELETE USING (created_by = auth.uid() OR public.is_team_owner(auth.uid(), team_id));
CREATE TRIGGER trg_report_schedules_updated BEFORE UPDATE ON public.report_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  cadence public.report_cadence NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count int DEFAULT 0,
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_runs_team ON public.report_runs(team_id, ran_at DESC);
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read runs" ON public.report_runs FOR SELECT USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members insert runs" ON public.report_runs FOR INSERT WITH CHECK (public.is_team_member(auth.uid(), team_id));

-- =====================================================
-- LEARNING FEEDBACK LOOP
-- =====================================================
CREATE TABLE public.model_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind public.feedback_kind NOT NULL,
  entity_type public.outreach_entity_type,
  entity_key text,
  model_name text,
  signal numeric,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_model_feedback_team ON public.model_feedback(team_id, kind, created_at DESC);
CREATE INDEX idx_model_feedback_entity ON public.model_feedback(entity_type, entity_key);
ALTER TABLE public.model_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own feedback" ON public.model_feedback FOR SELECT USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY "User writes own feedback" ON public.model_feedback FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE TABLE public.model_weight_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size int DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, model_name)
);
ALTER TABLE public.model_weight_overlays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read overlays" ON public.model_weight_overlays FOR SELECT USING (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members write overlays" ON public.model_weight_overlays FOR INSERT WITH CHECK (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members update overlays" ON public.model_weight_overlays FOR UPDATE USING (team_id IS NULL OR public.is_team_member(auth.uid(), team_id));
