
-- Auto-add team creator as owner via trigger (runs before RLS check on the returning SELECT)
CREATE OR REPLACE FUNCTION public.auto_add_team_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_team_owner
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_team_owner();
