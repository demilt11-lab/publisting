import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYNC_FN: Record<string, string> = {
  spotify: "sync-spotify-entity",
  genius: "sync-genius-entity",
  pro: "sync-pro-entity",
  soundcharts: "sync-soundcharts-entity",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  const { data: queued, error } = await sb
    .from("entity_refresh_log")
    .select("id, source, entity_type, pub_entity_id, retry_count")
    .eq("queued_for_retry", true)
    .in("status", ["error", "partial"])
    .order("started_at", { ascending: true })
    .limit(25);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; source: string; ok: boolean; error?: string }> = [];
  for (const row of queued ?? []) {
    const fn = SYNC_FN[row.source as string];
    if (!fn) {
      await sb.from("entity_refresh_log").update({ queued_for_retry: false }).eq("id", row.id);
      results.push({ id: row.id as string, source: row.source as string, ok: false, error: "unknown_source" });
      continue;
    }
    try {
      const r = await fetch(`${baseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ entity_type: row.entity_type, pub_entity_id: row.pub_entity_id }),
      });
      const ok = r.ok;
      const next = (row.retry_count ?? 0) + 1;
      await sb.from("entity_refresh_log").update({
        queued_for_retry: !ok && next < 5,
        retry_count: next,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id as string, source: row.source as string, ok });
    } catch (e) {
      results.push({ id: row.id as string, source: row.source as string, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});