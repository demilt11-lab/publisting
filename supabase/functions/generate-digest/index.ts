import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily in-app digest. For each user with a pin or subscription, summarize:
 *   - new alerts in the last 24h
 *   - top movers (by alert count)
 *   - new collaborators (track_credits) on tracked tracks/creators
 *   - missing-credit count
 *   - confidence-change count
 * Persists one digest_runs row per user.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 24 * 3600 * 1000);

  // Find candidate users: anyone with a pin OR subscription
  const { data: pinUsers } = await admin.from("pinned_entities").select("user_id");
  const { data: subUsers } = await admin.from("pub_alert_subscriptions").select("user_id");
  const userSet = new Set<string>([
    ...((pinUsers ?? []).map((r: any) => r.user_id)),
    ...((subUsers ?? []).map((r: any) => r.user_id)),
  ]);

  let written = 0;
  for (const user_id of userSet) {
    if (!user_id) continue;
    const { data: pins } = await admin.from("pinned_entities").select("entity_type, pub_id, label").eq("user_id", user_id);
    const ids = (pins ?? []).map((p: any) => p.pub_id);
    if (!ids.length) continue;

    const orFilter = [
      `pub_artist_id.in.(${ids.join(",")})`,
      `pub_track_id.in.(${ids.join(",")})`,
      `pub_creator_id.in.(${ids.join(",")})`,
    ].join(",");
    const { data: alerts } = await admin
      .from("lookup_alerts")
      .select("id, kind, severity, title, pub_artist_id, pub_track_id, pub_creator_id, payload, created_at")
      .gte("created_at", periodStart.toISOString())
      .or(orFilter);

    const counts: Record<string, number> = {};
    const sev: Record<string, number> = {};
    const kinds: Record<string, number> = {};
    let collab = 0; let missing = 0; let conf = 0;
    for (const a of (alerts ?? []) as any[]) {
      const id = a.pub_artist_id || a.pub_track_id || a.pub_creator_id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
      if (a.severity) sev[a.severity] = (sev[a.severity] ?? 0) + 1;
      if (a.kind) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
      if (a.kind === "pub_new_credit") collab += 1;
      if (a.kind === "confidence_drop" || a.kind === "source_conflict") conf += 1;
    }

    const movers = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([pub_id, n]) => {
        const pin = (pins ?? []).find((p: any) => p.pub_id === pub_id);
        return { pub_id, label: pin?.label || pub_id, entity_type: pin?.entity_type || null, alerts: n };
      });

    // Tracks tracked by this user that have no credits — opportunity
    const trackPubIds = (pins ?? []).filter((p: any) => p.entity_type === "track").map((p: any) => p.pub_id);
    if (trackPubIds.length) {
      const { data: tracks } = await admin.from("tracks").select("id, pub_track_id").in("pub_track_id", trackPubIds);
      const tIds = (tracks ?? []).map((t: any) => t.id);
      if (tIds.length) {
        const { data: credits } = await admin.from("track_credits").select("track_id").in("track_id", tIds);
        const has = new Set((credits ?? []).map((c: any) => c.track_id));
        missing = (tracks ?? []).filter((t: any) => !has.has(t.id)).length;
      }
    }

    const summary = {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      alert_count: alerts?.length ?? 0,
      severity: sev,
      top_kinds: kinds,
      top_movers: movers,
      new_collaborators: collab,
      missing_credits: missing,
      confidence_changes: conf,
    };

    const { error } = await admin.from("digest_runs").upsert(
      {
        user_id, cadence: "daily",
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        summary, alert_count: alerts?.length ?? 0,
      },
      { onConflict: "user_id,cadence,period_start" },
    );
    if (!error) written += 1;
  }

  return new Response(JSON.stringify({ ok: true, users: userSet.size, written }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});