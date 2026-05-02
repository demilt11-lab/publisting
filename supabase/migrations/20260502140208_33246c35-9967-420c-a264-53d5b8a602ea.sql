CREATE TABLE public.outreach_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  reason TEXT,
  dismissed_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, entity_type, entity_key)
);

CREATE INDEX idx_outreach_dismissals_team ON public.outreach_dismissals(team_id);
CREATE INDEX idx_outreach_dismissals_lookup ON public.outreach_dismissals(team_id, entity_type, entity_key);

ALTER TABLE public.outreach_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view dismissals"
ON public.outreach_dismissals FOR SELECT
USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can create dismissals"
ON public.outreach_dismissals FOR INSERT
WITH CHECK (public.is_team_member(auth.uid(), team_id) AND auth.uid() = dismissed_by);

CREATE POLICY "Team members can update dismissals"
ON public.outreach_dismissals FOR UPDATE
USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can delete dismissals"
ON public.outreach_dismissals FOR DELETE
USING (public.is_team_member(auth.uid(), team_id));

CREATE TRIGGER update_outreach_dismissals_updated_at
BEFORE UPDATE ON public.outreach_dismissals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();