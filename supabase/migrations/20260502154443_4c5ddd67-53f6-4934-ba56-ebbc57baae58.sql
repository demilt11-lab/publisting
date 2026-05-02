
CREATE OR REPLACE FUNCTION public.pub_search_rank(
  _q text,
  _type text DEFAULT NULL,
  _platform text DEFAULT NULL,
  _region text DEFAULT NULL,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
) RETURNS TABLE (
  entity_type text,
  pub_entity_id text,
  display_name text,
  subtitle text,
  matched_on text,
  confidence numeric,
  trust_score numeric,
  source_count integer,
  externals jsonb,
  platform_urls text[],
  rank numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _norm text; _ts tsquery;
BEGIN
  _norm := public.normalize_entity_name(_q);
  BEGIN
    _ts := to_tsquery('simple',
      regexp_replace(trim(coalesce(_norm,'')), '\s+', ':* & ', 'g') || ':*');
  EXCEPTION WHEN OTHERS THEN
    _ts := plainto_tsquery('simple', coalesce(_q,''));
  END;

  RETURN QUERY
  WITH base AS (
    SELECT sd.*,
      CASE
        WHEN sd.normalized_name = _norm THEN 'name_exact'
        WHEN sd.normalized_name LIKE _norm || '%' THEN 'name_prefix'
        WHEN sd.aliases @> ARRAY[_norm] THEN 'alias_exact'
        WHEN EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm) THEN 'external_exact'
        WHEN _q = ANY(sd.platform_urls) THEN 'url_exact'
        ELSE 'fuzzy'
      END AS matched_on,
      (CASE
        WHEN sd.normalized_name = _norm THEN 1.0
        WHEN sd.normalized_name LIKE _norm || '%' THEN 0.85
        WHEN sd.aliases @> ARRAY[_norm] THEN 0.92
        WHEN EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm) THEN 0.97
        WHEN _q = ANY(sd.platform_urls) THEN 0.96
        ELSE GREATEST(0.05, ts_rank(sd.searchable_text, _ts))::numeric
      END)::numeric AS conf,
      (SELECT count(*) FROM jsonb_object_keys(sd.externals))::int AS sc
    FROM public.search_documents sd
    WHERE
      (_type IS NULL OR sd.entity_type = _type)
      AND (
        sd.normalized_name = _norm
        OR sd.normalized_name LIKE _norm || '%'
        OR sd.aliases @> ARRAY[_norm]
        OR sd.searchable_text @@ _ts
        OR EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm)
        OR _q = ANY(sd.platform_urls)
      )
      AND (_platform IS NULL OR sd.externals ? _platform)
      AND (_region IS NULL OR sd.region_tags @> ARRAY[_region])
  )
  SELECT
    b.entity_type, b.pub_entity_id, b.display_name, b.subtitle, b.matched_on,
    round(b.conf, 3) AS confidence,
    b.trust_score,
    COALESCE(b.sc, 0) AS source_count,
    b.externals, b.platform_urls,
    round(
      (b.conf * 0.55) +
      (LEAST(1.0::numeric, b.popularity_score) * 0.10) +
      (LEAST(1.0::numeric, b.activity_score)   * 0.10) +
      (LEAST(1.0::numeric, b.coverage_score)   * 0.15) +
      (LEAST(1.0::numeric, b.trust_score)      * 0.10)
    , 4) AS rank
  FROM base b
  ORDER BY rank DESC NULLS LAST, b.popularity_score DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END $$;
