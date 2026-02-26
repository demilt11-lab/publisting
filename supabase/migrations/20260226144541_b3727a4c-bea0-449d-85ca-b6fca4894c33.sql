-- Allow DELETE on streaming_stats_cache (for cache clearing)
CREATE POLICY "Anyone can delete streaming stats cache"
ON public.streaming_stats_cache
FOR DELETE
USING (true);

-- Allow DELETE on pro_cache (for cache clearing)
CREATE POLICY "Anyone can delete PRO cache"
ON public.pro_cache
FOR DELETE
USING (true);

-- Allow DELETE on mlc_shares_cache (for cache clearing)
CREATE POLICY "Anyone can delete MLC shares cache"
ON public.mlc_shares_cache
FOR DELETE
USING (true);