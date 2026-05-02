-- Ensure pgcrypto is enabled (it provides gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Rewrite gen_pub_id to fully-qualify the call so it works regardless of search_path
CREATE OR REPLACE FUNCTION public.gen_pub_id(prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  bytes bytea;
  out_id text := '';
  i int;
  v int;
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyz';
BEGIN
  bytes := extensions.gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v := get_byte(bytes, i);
    out_id := out_id || substr(alphabet, (v % 36) + 1, 1);
  END LOOP;
  RETURN 'pub_' || prefix || '_' || out_id;
END;
$$;