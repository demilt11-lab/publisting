// Aggregates data quality metrics for /settings and /admin/data-quality.
// Also supports action=force_revalidate to clear stale cache + queue revalidation.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? (req.method === "POST" ? (await req.json().catch(() => ({}))).action : null);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "force_revalidate") {
      const now = new Date().toISOString();
      const [a, b, c] = await Promise.all([
        sb.from("spotify_artist_cache").update({ expires_at: now }).gt("expires_at", now),
        sb.from("soundcharts_cache").update({ expires_at: now }).gt("expires_at", now),
        sb.from("genius_cache").update({ expires_at: now }).gt("expires_at", now),
      ]);
      return new Response(JSON.stringify({
        ok: true,
        invalidated: { spotify: a.count ?? null, soundcharts: b.count ?? null, genius: c.count ?? null },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();
    const [qAll, qLow, qFlagged, dPending, dAuto, scTotal, scFresh, gTotal, gFresh, spTotal, spFresh, avgComp] = await Promise.all([
      sb.from("search_result_quality").select("*", { count: "exact", head: true }),
      sb.from("search_result_quality").select("*", { count: "exact", head: true }).lt("completeness_score", 50),
      sb.from("search_result_quality").select("*", { count: "exact", head: true }).neq("validation_flags", "[]"),
      sb.from("potential_duplicates").select("*", { count: "exact", head: true }).eq("merge_status", "pending"),
      sb.from("potential_duplicates").select("*", { count: "exact", head: true }).eq("merge_status", "auto_merged"),
      sb.from("soundcharts_cache").select("*", { count: "exact", head: true }),
      sb.from("soundcharts_cache").select("*", { count: "exact", head: true }).gt("expires_at", nowIso),
      sb.from("genius_cache").select("*", { count: "exact", head: true }),
      sb.from("genius_cache").select("*", { count: "exact", head: true }).gt("expires_at", nowIso),
      sb.from("spotify_artist_cache").select("*", { count: "exact", head: true }),
      sb.from("spotify_artist_cache").select("*", { count: "exact", head: true }).gt("expires_at", nowIso),
      sb.from("search_result_quality").select("completeness_score").limit(1000),
    ]);

    const scores = (avgComp.data ?? []).map((r: any) => r.completeness_score ?? 0);
    const overallCompleteness = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const hitRate = (fresh: number | null, total: number | null) =>
      total && total > 0 ? Math.round(((fresh ?? 0) / total) * 100) : 0;

    return new Response(JSON.stringify({
      ok: true,
      overall_completeness: overallCompleteness,
      total_records: qAll.count ?? 0,
      low_quality_records: qLow.count ?? 0,
      flagged_records: qFlagged.count ?? 0,
      pending_duplicates: dPending.count ?? 0,
      auto_merged_duplicates: dAuto.count ?? 0,
      caches: {
        spotify: { total: spTotal.count ?? 0, fresh: spFresh.count ?? 0, hit_rate: hitRate(spFresh.count, spTotal.count) },
        soundcharts: { total: scTotal.count ?? 0, fresh: scFresh.count ?? 0, hit_rate: hitRate(scFresh.count, scTotal.count) },
        genius: { total: gTotal.count ?? 0, fresh: gFresh.count ?? 0, hit_rate: hitRate(gFresh.count, gTotal.count) },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});