// Aggregates infra metrics for /admin/health.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = admin();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const winStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();

    const [{ data: calls }, { data: limiter }, { data: configs }, { data: cache }, { data: queue }] = await Promise.all([
      sb.from("api_call_log").select("service_name, outcome, status_code").gte("occurred_at", since).limit(5000),
      sb.from("api_rate_limiter").select("*").gte("window_start_time", winStart),
      sb.from("api_service_config").select("service_name, limit_per_minute"),
      sb.from("search_query_cache").select("hit_count, expires_at, created_at").limit(2000),
      sb.from("pending_api_requests").select("status").limit(2000),
    ]);

    const services: Record<string, { total: number; success: number; errors: number; rate_limited: number; validation_errors: number; success_rate: number; limit: number; current: number; usage_pct: number }> = {};
    for (const c of (configs ?? []) as any[]) {
      services[c.service_name] = {
        total: 0, success: 0, errors: 0, rate_limited: 0, validation_errors: 0,
        success_rate: 0, limit: c.limit_per_minute, current: 0, usage_pct: 0,
      };
    }
    for (const r of (calls ?? []) as any[]) {
      const s = (services[r.service_name] ||= {
        total: 0, success: 0, errors: 0, rate_limited: 0, validation_errors: 0, success_rate: 0, limit: 60, current: 0, usage_pct: 0,
      });
      s.total++;
      if (r.outcome === "success") s.success++;
      else if (r.outcome === "rate_limited") s.rate_limited++;
      else if (r.outcome === "validation_error") s.validation_errors++;
      else if (r.outcome === "error") s.errors++;
    }
    for (const k of Object.keys(services)) {
      const s = services[k];
      s.success_rate = s.total ? Math.round((s.success / s.total) * 100) : 100;
    }
    for (const w of (limiter ?? []) as any[]) {
      const s = (services[w.service_name] ||= { total: 0, success: 0, errors: 0, rate_limited: 0, validation_errors: 0, success_rate: 100, limit: w.limit_per_minute, current: 0, usage_pct: 0 });
      s.current = w.requests_made;
      s.limit = w.limit_per_minute;
      s.usage_pct = w.limit_per_minute ? Math.min(100, Math.round((w.requests_made / w.limit_per_minute) * 100)) : 0;
    }

    const now = Date.now();
    const cacheRows = (cache ?? []) as any[];
    const fresh = cacheRows.filter((r) => new Date(r.expires_at).getTime() > now).length;
    const totalHits = cacheRows.reduce((a, r) => a + (r.hit_count ?? 0), 0);
    const cache_hit_rate = cacheRows.length ? Math.round((totalHits / (totalHits + cacheRows.length)) * 100) : 0;

    const queueRows = (queue ?? []) as any[];
    const queueByStatus: Record<string, number> = {};
    for (const q of queueRows) queueByStatus[q.status] = (queueByStatus[q.status] ?? 0) + 1;

    const totals = (calls ?? []).reduce(
      (acc: any, r: any) => {
        acc.total++;
        if (r.outcome === "success") acc.success++;
        if (r.outcome === "validation_error") acc.validation_errors++;
        return acc;
      },
      { total: 0, success: 0, validation_errors: 0 },
    );

    return new Response(JSON.stringify({
      ok: true,
      window: "last_hour",
      generated_at: new Date().toISOString(),
      overall: {
        api_calls: totals.total,
        success_rate: totals.total ? Math.round((totals.success / totals.total) * 100) : 100,
        validation_errors: totals.validation_errors,
        cache_entries: cacheRows.length,
        fresh_cache_entries: fresh,
        cache_hit_rate,
        queue: queueByStatus,
      },
      services,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});