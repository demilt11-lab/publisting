import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDERS = ["spotify", "genius", "pro", "soundcharts"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const window_end = new Date();
  const window_start = new Date(window_end.getTime() - 24 * 60 * 60 * 1000);
  const inserted: string[] = [];

  for (const p of PROVIDERS) {
    const { data: rows } = await sb
      .from("entity_refresh_log")
      .select("status, started_at, completed_at, error_text")
      .eq("source", p)
      .gte("started_at", window_start.toISOString());

    const list = rows ?? [];
    const total = list.length;
    const ok = list.filter((r) => r.status === "ok").length;
    const partial = list.filter((r) => r.status === "partial").length;
    const errors = list.filter((r) => r.status === "error");
    const latencies = list
      .filter((r) => r.completed_at && r.started_at)
      .map((r) => new Date(r.completed_at as string).getTime() - new Date(r.started_at as string).getTime())
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const lastSuccess = [...list].reverse().find((r) => r.status === "ok")?.started_at ?? null;
    const lastErr = [...list].reverse().find((r) => r.status === "error");

    await sb.from("provider_health_snapshot").insert({
      provider: p,
      window_start: window_start.toISOString(),
      window_end: window_end.toISOString(),
      total_runs: total,
      ok_runs: ok,
      partial_runs: partial,
      error_runs: errors.length,
      avg_latency_ms: avg,
      last_success_at: lastSuccess,
      last_error_at: lastErr?.started_at ?? null,
      last_error_text: lastErr?.error_text ?? null,
    });
    inserted.push(p);
  }

  return new Response(JSON.stringify({ snapshotted: inserted, window_start, window_end }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});