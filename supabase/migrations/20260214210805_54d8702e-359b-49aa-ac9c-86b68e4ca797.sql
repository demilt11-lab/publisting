-- Fix: pro_cache "Service role can manage PRO cache" policy is set to public role
-- with USING(true) and WITH CHECK(true) on ALL operations, meaning anyone can write/delete cache.
-- Replace with a properly scoped policy.

DROP POLICY IF EXISTS "Service role can manage PRO cache" ON public.pro_cache;

-- Edge functions use the anon key but run server-side, so we need INSERT/UPDATE for anon role too.
-- However, we should at least prevent DELETE from anonymous users.
-- Better approach: allow INSERT and UPDATE (upsert) but restrict DELETE.

CREATE POLICY "Anyone can insert PRO cache"
ON public.pro_cache
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update PRO cache"
ON public.pro_cache
FOR UPDATE
USING (true)
WITH CHECK (true);
