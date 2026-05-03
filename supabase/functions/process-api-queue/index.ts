// Drains pending_api_requests when their service window has reset.
// Called every minute by pg_cron.
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

async function dispatch(sb: ReturnType<typeof admin>, row: any): Promise<{ ok: boolean; error?: string }> {
  // Re-check the rate limit first; if still over, leave it.
  const { data: rlRaw } = await sb.rpc("api_rate_limit_check", { _service: row.service_name });
  const rl: any = rlRaw ?? { allowed: true };
  if (!rl.allowed) return { ok: false, error: "still_rate_limited" };

  try {
    const { error } = await sb.functions.invoke(row.edge_function, { body: row.payload ?? {} });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = admin();
  const nowIso = new Date().toISOString();

  // Lock up to 25 due rows
  const { data: due } = await sb.from("pending_api_requests")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(25);

  let processed = 0, succeeded = 0, deferred = 0, dead = 0;
  for (const row of (due ?? []) as any[]) {
    await sb.from("pending_api_requests").update({ status: "processing" }).eq("id", row.id);
    const r = await dispatch(sb, row);
    processed++;
    if (r.ok) {
      await sb.from("pending_api_requests").update({
        status: "done", processed_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null,
      }).eq("id", row.id);
      succeeded++;
    } else {
      const nextAttempts = row.attempts + 1;
      if (nextAttempts >= row.max_attempts) {
        await sb.from("pending_api_requests").update({
          status: "dead", attempts: nextAttempts, last_error: r.error ?? "failed",
          processed_at: new Date().toISOString(),
        }).eq("id", row.id);
        dead++;
      } else {
        const delayMs = Math.min(30_000, 1000 * Math.pow(2, nextAttempts));
        await sb.from("pending_api_requests").update({
          status: "pending", attempts: nextAttempts, last_error: r.error ?? "deferred",
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
        }).eq("id", row.id);
        deferred++;
      }
    }
  }

  // Periodic cleanup
  await sb.rpc("api_infra_cleanup");

  return new Response(JSON.stringify({ ok: true, processed, succeeded, deferred, dead }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});