CREATE OR REPLACE FUNCTION public.trg_autopin_on_watchlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _entity_uuid uuid; _uid uuid;
BEGIN
  _uid := NEW.created_by;
  IF _uid IS NULL OR NEW.pub_creator_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source, label)
  VALUES (_uid, 'creator', NEW.pub_creator_id, 'watchlist', NEW.person_name)
  ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
  SELECT id INTO _entity_uuid FROM public.creators WHERE pub_creator_id = NEW.pub_creator_id;
  IF _entity_uuid IS NOT NULL THEN
    INSERT INTO public.pub_alert_subscriptions(user_id, entity_type, entity_id, pub_id)
    VALUES (_uid, 'creator', _entity_uuid, NEW.pub_creator_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;