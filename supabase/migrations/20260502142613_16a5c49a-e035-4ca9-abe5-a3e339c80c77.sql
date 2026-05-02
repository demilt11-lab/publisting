ALTER FUNCTION public.gen_pub_id(text) SET search_path = public;
ALTER FUNCTION public.normalize_entity_name(text) SET search_path = public;
ALTER FUNCTION public.artists_search_doc_trigger() SET search_path = public;
ALTER FUNCTION public.albums_search_doc_trigger() SET search_path = public;
ALTER FUNCTION public.tracks_search_doc_trigger() SET search_path = public;