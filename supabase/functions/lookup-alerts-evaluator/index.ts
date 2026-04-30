// Phase 3: Lookup Intelligence alerts evaluator.
// Scans the most-recent snapshot per tracked track, compares to the previous
// snapshot, and creates alerts for:
//   - spike            : large jump in any metric vs prior snapshot
//   - confidence_drop  : confidence_score drops by >= 0.15 vs trailing avg
//   - source_conflict  : new high-severity conflict in latest audit
//   - new_platform     : platform url appears that wasn't in prior snapshot raw
//
// Emits in-app rows to public.lookup_alerts and (optionally) forwards to the
// Inngest event bus via the Lovable connector gateway, so external workflows
// (Slack, webhooks) can subscribe later.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const INNGEST_API_KEY = Deno.env.get("INNGEST_API_KEY");

async function emitInngest(events: Array<{ name: string; data: any }>) {
  if (!LOVABLE_API_KEY || !INNGEST_API_KEY || events.length === 0) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(events),
    });
    clearTimeout(t);
  } catch (e) { console.warn("inngest emit failed", e); }
}

type Snapshot = {
  id: string;
  captured_at: string;
  track_id: string | null;
  track_key: string | null;
  spotify_popularity: number | null;
  spotify_stream_count: number | null;
  youtube_view_count: number | null;
  genius_pageviews: number | null;
  shazam_count: number | null;
  source_coverage: number | null;
  confidence_score: number | null;
  raw: any;
};

function pctJump(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev <= 0) return null;
  return (curr - prev) / prev;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const created: any[] = [];
  const inngestEvents: Array<{ name: string; data: any }> = [];

  try {
    // Pull tracked tracks (or a curated set if provided)
    let body: any = {};
    try { body = await req.json(); } catch {}
    const onlyTracked: boolean = body?.onlyTracked !== false;
    const trackKeys: string[] = Array.isArray(body?.trackKeys) ? body.trackKeys : [];

    let keys = trackKeys;
    if (!keys.length && onlyTracked) {
      const { data: tracked } = await sb.from("lookup_tracked_tracks")
        .select("track_key").not("track_key", "is", null).limit(500);
      keys = (tracked || []).map((r: any) => r.track_key).filter(Boolean);
    }
    if (!keys.length) {
      // Fall back to recently snapshotted tracks
      const { data: recent } = await sb.from("lookup_snapshots")
        .select("track_key").not("track_key", "is", null)
        .order("captured_at", { ascending: false }).limit(200);
      keys = Array.from(new Set((recent || []).map((r: any) => r.track_key).filter(Boolean)));
    }

    for (const trackKey of keys) {
      // Latest 5 snapshots for this track
      const { data: snaps } = await sb.from("lookup_snapshots")
        .select("id, captured_at, track_id, track_key, spotify_popularity, spotify_stream_count, youtube_view_count, genius_pageviews, shazam_count, source_coverage, confidence_score, raw")
        .eq("track_key", trackKey).order("captured_at", { ascending: false }).limit(5);
      const list = (snaps || []) as Snapshot[];
      if (list.length < 2) continue;
      const curr = list[0];
      const prev = list[1];
      const trail = list.slice(1);
      const trailAvgConf = trail.length
        ? trail.reduce((a, b) => a + (b.confidence_score || 0), 0) / trail.length
        : null;

      // 1) Spike detection — flag >=50% jump in any metric (>=10% for popularity)
      const checks: Array<{ metric: string; curr: number | null; prev: number | null; threshold: number; absMin?: number }> = [
        { metric: "spotify_popularity",  curr: curr.spotify_popularity,  prev: prev.spotify_popularity,  threshold: 0.10, absMin: 5 },
        { metric: "spotify_stream_count", curr: curr.spotify_stream_count, prev: prev.spotify_stream_count, threshold: 0.50, absMin: 100000 },
        { metric: "youtube_view_count",  curr: curr.youtube_view_count,  prev: prev.youtube_view_count,  threshold: 0.50, absMin: 100000 },
        { metric: "genius_pageviews",    curr: curr.genius_pageviews,    prev: prev.genius_pageviews,    threshold: 0.50, absMin: 5000 },
        { metric: "shazam_count",        curr: curr.shazam_count,        prev: prev.shazam_count,        threshold: 0.50, absMin: 5000 },
      ];
      for (const c of checks) {
        const jump = pctJump(c.curr, c.prev);
        if (jump == null || jump < c.threshold) continue;
        if (c.absMin && (c.curr! - c.prev!) < c.absMin) continue;
        const alert = {
          kind: "spike",
          severity: jump >= 1 ? "high" : "warn",
          title: `${c.metric} spike (+${Math.round(jump * 100)}%)`,
          body: `${trackKey} — ${c.metric} ${c.prev?.toLocaleString()} → ${c.curr?.toLocaleString()}`,
          track_key: trackKey,
          track_id: curr.track_id,
          payload: { metric: c.metric, prev: c.prev, curr: c.curr, jumpPct: jump, capturedAt: curr.captured_at },
          delivered_via: ["in_app", LOVABLE_API_KEY && INNGEST_API_KEY ? "inngest" : ""].filter(Boolean) as string[],
        };
        const { data: ins } = await sb.from("lookup_alerts").insert(alert).select("id").maybeSingle();
        if (ins) created.push({ id: ins.id, ...alert });
        inngestEvents.push({ name: "publisting/alert.spike", data: alert });
      }

      // 2) Confidence drop vs trailing average
      if (curr.confidence_score != null && trailAvgConf != null && (trailAvgConf - curr.confidence_score) >= 0.15) {
        const alert = {
          kind: "confidence_drop",
          severity: "warn",
          title: `Confidence dropped ${Math.round((trailAvgConf - curr.confidence_score) * 100)} pts`,
          body: `${trackKey} — confidence ${Math.round(trailAvgConf * 100)}% → ${Math.round((curr.confidence_score || 0) * 100)}%`,
          track_key: trackKey,
          track_id: curr.track_id,
          payload: { trailAvg: trailAvgConf, curr: curr.confidence_score, capturedAt: curr.captured_at },
          delivered_via: ["in_app"],
        };
        const { data: ins } = await sb.from("lookup_alerts").insert(alert).select("id").maybeSingle();
        if (ins) created.push({ id: ins.id, ...alert });
        inngestEvents.push({ name: "publisting/alert.confidence_drop", data: alert });
      }

      // 3) New platform match: scan source_statuses in raw
      const currSources: string[] = (curr.raw?.sources || []).filter((s: any) => s.status === "success").map((s: any) => s.name);
      const prevSources: string[] = (prev.raw?.sources || []).filter((s: any) => s.status === "success").map((s: any) => s.name);
      const fresh = currSources.filter((s) => !prevSources.includes(s));
      if (fresh.length) {
        const alert = {
          kind: "new_platform",
          severity: "info",
          title: `New platform matches: ${fresh.join(", ")}`,
          body: `${trackKey} — first appearance on ${fresh.join(", ")}`,
          track_key: trackKey,
          track_id: curr.track_id,
          payload: { newSources: fresh, capturedAt: curr.captured_at },
          delivered_via: ["in_app"],
        };
        const { data: ins } = await sb.from("lookup_alerts").insert(alert).select("id").maybeSingle();
        if (ins) created.push({ id: ins.id, ...alert });
        inngestEvents.push({ name: "publisting/alert.new_platform", data: alert });
      }
    }

    // 4) Source conflicts — scan latest audits for new high-severity conflicts
    const { data: latestAudits } = await sb.from("lookup_audit")
      .select("id, created_at, query_raw, best_match_track_id, best_match")
      .order("created_at", { ascending: false }).limit(50);
    for (const audit of (latestAudits || [])) {
      const conflicts: any[] = (audit as any).best_match?.conflicts || (audit as any).payload?.conflicts || [];
      const high = (conflicts || []).filter((c: any) => c?.severity === "high");
      if (!high.length) continue;
      // Skip if we already alerted this audit
      const { data: existing } = await sb.from("lookup_alerts")
        .select("id").eq("kind", "source_conflict")
        .contains("payload", { audit_id: (audit as any).id }).maybeSingle();
      if (existing) continue;
      const alert = {
        kind: "source_conflict",
        severity: "warn",
        title: `Source conflict: ${high.map((c) => c.field).join(", ")}`,
        body: `${(audit as any).query_raw} — ${high[0].note || "sources disagree"}`,
        track_id: (audit as any).best_match_track_id,
        payload: { audit_id: (audit as any).id, conflicts: high },
        delivered_via: ["in_app"],
      };
      const { data: ins } = await sb.from("lookup_alerts").insert(alert).select("id").maybeSingle();
      if (ins) created.push({ id: ins.id, ...alert });
      // Also enqueue for analyst review
      await sb.from("review_queue").insert({
        kind: "conflict", severity: "warn",
        title: `Conflict in ${(audit as any).query_raw}`,
        payload: { conflicts: high },
        related_audit_id: (audit as any).id,
        related_track_key: null,
      });
      inngestEvents.push({ name: "publisting/alert.source_conflict", data: alert });
    }

    await emitInngest(inngestEvents);

    return json({ success: true, created: created.length, durationMs: Date.now() - t0 });
  } catch (e) {
    console.error("alerts evaluator failed", e);
    return json({ success: false, error: String((e as Error).message) }, 500);
  }
});