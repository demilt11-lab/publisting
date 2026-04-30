// Scheduled background snapshot job for tracked tracks.
// Iterates lookup_tracked_tracks (active=true) ordered by stalest snapshot,
// and re-invokes lookup-intelligence to refresh metrics + history.
// Designed to be invoked by pg_cron or manual admin trigger.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const BATCH = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data: tracked } = await sb
      .from("lookup_tracked_tracks")
      .select("id, track_key, title, artist, last_snapshot_at")
      .eq("active", true)
      .order("last_snapshot_at", { ascending: true, nullsFirst: true })
      .limit(BATCH);

    const results: any[] = [];
    for (const t of tracked || []) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/lookup-intelligence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY,
          },
          body: JSON.stringify({ query: `${t.title} ${t.artist}` }),
        });
        const ok = r.ok;
        await sb.from("lookup_tracked_tracks").update({ last_snapshot_at: new Date().toISOString() }).eq("id", t.id);
        results.push({ track_key: t.track_key, ok });
      } catch (e) {
        results.push({ track_key: t.track_key, ok: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});