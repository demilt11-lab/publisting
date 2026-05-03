import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err, detailPathFor, normalizeName, classifyQuery } from "../_shared/pub.ts";
import { checkUserRateLimit, rateLimitResponse, logSearch } from "../_shared/userRateLimit.ts";

interface Body {
  q?: string;
  type?: "artist" | "track" | "album" | "creator";
  platform?: string;
  region?: string;
  limit?: number;
  offset?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: Body = {};
  try {
    if (req.method === "POST") body = await req.json();
    else {
      const u = new URL(req.url);
      body = {
        q: u.searchParams.get("q") || undefined,
        type: (u.searchParams.get("type") as any) || undefined,
        platform: u.searchParams.get("platform") || undefined,
        region: u.searchParams.get("region") || undefined,
        limit: Number(u.searchParams.get("limit") || 20),
        offset: Number(u.searchParams.get("offset") || 0),
      };
    }
  } catch { return err("Invalid JSON body", 400); }

  const q = (body.q || "").trim();
  if (!q) return err("Missing 'q'", 400);

  // Per-user rate limit (100 searches / hour). Anonymous calls bypass the check.
  const rc = await checkUserRateLimit(req, "search", 100, 60);
  if (!rc.allowed) return rateLimitResponse(rc, corsHeaders);

  const limit = Math.min(50, Math.max(1, Number(body.limit ?? 20)));
  const offset = Math.max(0, Number(body.offset ?? 0));

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const cls = classifyQuery(q);

  // ISRC short-circuit: deterministic exact match
  if (cls.type === "isrc") {
    const { data: tr } = await sb.from("tracks").select("pub_track_id, title, primary_artist_name, isrc").eq("isrc", cls.value).limit(limit);
    const results = (tr ?? []).map((t: any) => ({
      entity_type: "track" as const,
      pub_entity_id: t.pub_track_id,
      display_name: t.title,
      subtitle: t.primary_artist_name,
      matched_on: "isrc_exact",
      confidence: 1.0,
      trust_score: 1.0,
      source_count: 1,
      externals: { isrc: t.isrc },
      detail_path: detailPathFor("track", t.pub_track_id),
    }));
    return ok({ query: q, query_type: "isrc", results, total: results.length });
  }

  // UPC: deterministic album lookup
  if (cls.type === "upc") {
    const { data: ab } = await sb.from("albums").select("pub_album_id, title, primary_artist_name, upc").eq("upc", cls.value).limit(limit);
    const results = (ab ?? []).map((a: any) => ({
      entity_type: "album" as const,
      pub_entity_id: a.pub_album_id,
      display_name: a.title,
      subtitle: a.primary_artist_name,
      matched_on: "upc_exact",
      confidence: 1.0,
      trust_score: 1.0,
      source_count: 1,
      externals: { upc: a.upc },
      detail_path: detailPathFor("album", a.pub_album_id),
    }));
    return ok({ query: q, query_type: "upc", results, total: results.length });
  }

  // Run weighted search via RPC
  const { data, error } = await sb.rpc("pub_search_rank", {
    _q: cls.type === "url" ? q : normalizeName(q),
    _type: body.type ?? null,
    _platform: body.platform ?? null,
    _region: body.region ?? null,
    _limit: limit,
    _offset: offset,
  });
  if (error) return err(error.message, 500);

  const results = (data ?? []).map((r: any) => ({
    entity_type: r.entity_type,
    pub_entity_id: r.pub_entity_id,
    display_name: r.display_name,
    subtitle: r.subtitle,
    matched_on: r.matched_on,
    confidence: Number(r.confidence),
    trust_score: Number(r.trust_score),
    source_count: Number(r.source_count),
    externals: r.externals,
    detail_path: detailPathFor(r.entity_type, r.pub_entity_id),
  }));

  return ok({ query: q, query_type: cls.type, results, total: results.length });
});