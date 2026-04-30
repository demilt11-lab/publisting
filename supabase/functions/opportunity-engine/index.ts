// Computes composite opportunity scores + lifecycle states for tracks,
// artists, writers, and producers using historical snapshots, chart history,
// alert velocity, and collaborator-network quality.
//
// Run modes:
//   POST {} (cron)             → recompute everything reachable from snapshots/charts
//   POST { entity_type, entity_key } → recompute one entity
//
// Response: { ok, processed, errors }

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── helpers ────────────────────────────────────────────────────────
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Recency-weighted exponential decay: newer points count more. half-life ~ 14d */
function decayWeight(daysAgo: number, halfLifeDays = 14) {
  return Math.pow(0.5, Math.max(0, daysAgo) / halfLifeDays);
}

function daysBetween(a: Date, b: Date) {
  return Math.abs((+a - +b) / 86_400_000);
}

/** Simple slope (per day) of a numeric series weighted by recency. */
function weightedSlope(points: { t: Date; v: number }[]) {
  if (points.length < 2) return 0;
  const now = new Date();
  const xs: number[] = [], ys: number[] = [], ws: number[] = [];
  for (const p of points) {
    const days = daysBetween(now, p.t);
    xs.push(-days); ys.push(p.v); ws.push(decayWeight(days));
  }
  const sw = ws.reduce((a, b) => a + b, 0);
  if (sw === 0) return 0;
  const mx = xs.reduce((a, b, i) => a + b * ws[i], 0) / sw;
  const my = ys.reduce((a, b, i) => a + b * ws[i], 0) / sw;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += ws[i] * (xs[i] - mx) * (ys[i] - my);
    den += ws[i] * (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Map a slope to a 0-100 component using a soft saturating curve. */
function slopeToComponent(slope: number, k = 5) {
  // tanh saturation; positive slope → high score, negative → low
  const t = Math.tanh(slope / k); // -1..1
  return clamp(50 + 50 * t, 0, 100);
}

function lifecycleFromSignals(opts: {
  slopePopularity: number;
  recentChartCount: number;
  alertVelocity: number;
  dataPoints: number;
  latestPopularity: number;
}): { state: string; confidence: number } {
  const { slopePopularity, recentChartCount, alertVelocity, dataPoints, latestPopularity } = opts;

  if (dataPoints < 2) {
    // Only one or zero snapshots — too little signal
    return { state: "stable", confidence: 0.2 };
  }
  // Strong positive trend + recent chart presence → accelerating/peaking
  if (slopePopularity > 0.5 && recentChartCount >= 3) {
    return { state: "peaking", confidence: 0.85 };
  }
  if (slopePopularity > 0.2) {
    if (latestPopularity < 40 || recentChartCount === 0) return { state: "emerging", confidence: 0.7 };
    return { state: "accelerating", confidence: 0.8 };
  }
  if (slopePopularity < -0.2) {
    return { state: "declining", confidence: 0.75 };
  }
  if (alertVelocity === 0 && Math.abs(slopePopularity) < 0.05 && latestPopularity < 10) {
    return { state: "dormant", confidence: 0.6 };
  }
  return { state: "stable", confidence: 0.6 };
}

// ── core ──────────────────────────────────────────────────────────
async function computeForTrack(
  sb: any,
  trackKey: string,
  trackId: string | null,
  display: { title: string; primary_artist: string },
) {
  // Snapshots (last 90d)
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: snaps } = await sb
    .from("lookup_snapshots")
    .select("captured_at, spotify_popularity, spotify_stream_count, youtube_view_count, source_coverage, confidence_score")
    .eq("track_key", trackKey).gte("captured_at", since)
    .order("captured_at", { ascending: true });

  const snapPoints = (snaps || [])
    .filter((s: any) => typeof s.spotify_popularity === "number")
    .map((s: any) => ({ t: new Date(s.captured_at), v: s.spotify_popularity as number }));

  const slopePop = weightedSlope(snapPoints);
  const momentum = slopeToComponent(slopePop, 0.5);
  const latestPop = snapPoints.length ? snapPoints[snapPoints.length - 1].v : 0;

  // Chart history (last 60d)
  const chartSince = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data: charts } = await sb
    .from("chart_placements_history")
    .select("chart_name, position, captured_on")
    .eq("track_key", trackKey).gte("captured_on", chartSince);
  const recentChartCount = (charts || []).length;
  // Best position influence
  const bestPos = (charts || []).reduce((m: number, c: any) => Math.min(m, c.position ?? 999), 999);
  const chartComp = clamp(
    Math.min(80, recentChartCount * 8) + (bestPos < 999 ? clamp(20 - Math.floor(bestPos / 5)) : 0),
  );

  // Playlist history (count of distinct playlists)
  const { data: pls } = await sb
    .from("playlist_placements_history")
    .select("playlist_id, captured_on")
    .eq("track_key", trackKey).gte("captured_on", chartSince);
  const playlistCount = new Set((pls || []).map((p: any) => p.playlist_id)).size;

  // Alert velocity (last 14d)
  const alertSince = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: alerts } = await sb
    .from("lookup_alerts")
    .select("severity, created_at")
    .eq("track_key", trackKey).gte("created_at", alertSince);
  const alertScore = (alerts || []).reduce((s: number, a: any) => s + (a.severity === "high" ? 8 : a.severity === "warn" ? 4 : 2), 0);
  const alertVelocity = clamp(alertScore);

  // Network quality: # distinct collaborators on this artist's other work
  let networkComp = 0;
  if (display.primary_artist) {
    const { data: edges } = await sb
      .from("collaborator_edges")
      .select("target_name, weight")
      .ilike("source_name", display.primary_artist).limit(50);
    const totalWeight = (edges || []).reduce((s: number, e: any) => s + Number(e.weight || 0), 0);
    networkComp = clamp(Math.min(60, (edges || []).length * 4) + Math.min(40, totalWeight / 5));
  }

  // Signing gap: bonus when track has data but no canonical entry yet (proxy for "unsigned upside")
  const signingGap = trackId ? 30 : 70;

  // Composite weights
  const score = clamp(
    momentum * 0.30 +
    chartComp * 0.20 +
    Math.min(100, playlistCount * 8) * 0.10 +
    alertVelocity * 0.10 +
    networkComp * 0.15 +
    signingGap * 0.15,
  );

  const lifecycle = lifecycleFromSignals({
    slopePopularity: slopePop,
    recentChartCount,
    alertVelocity,
    dataPoints: snapPoints.length,
    latestPopularity: latestPop,
  });

  const explanationBits: string[] = [];
  if (slopePop > 0.2) explanationBits.push(`Spotify popularity rising (slope ${slopePop.toFixed(2)}/day).`);
  else if (slopePop < -0.2) explanationBits.push(`Spotify popularity falling (slope ${slopePop.toFixed(2)}/day).`);
  if (recentChartCount > 0) explanationBits.push(`${recentChartCount} chart placements in 60d (best #${bestPos}).`);
  if (playlistCount > 0) explanationBits.push(`${playlistCount} editorial playlists.`);
  if (alertVelocity > 0) explanationBits.push(`${(alerts || []).length} recent alerts.`);
  if (networkComp > 30) explanationBits.push(`Active collaborator network.`);
  if (!trackId) explanationBits.push(`No canonical track row — likely unsigned upside.`);

  return {
    score, momentum, chartComp, alertVelocity, networkComp, signingGap,
    lifecycle, dataPoints: snapPoints.length,
    explanation: explanationBits.join(" "),
    signals: {
      slopePop, latestPop, recentChartCount, bestPos, playlistCount,
      alertCount: (alerts || []).length,
    },
  };
}

async function computeForPerson(
  sb: any,
  name: string,
  role: "artist" | "writer" | "producer",
  contributorId: string | null,
) {
  // Aggregate across this person's recent tracks (last 90d snapshots)
  // We approximate by joining via collaborator_edges + recent alerts mentioning the name
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  // Collaborator edges
  const { data: edges } = await sb
    .from("collaborator_edges")
    .select("target_name, weight, last_seen_at")
    .ilike("source_name", name).limit(100);
  const recentEdges = (edges || []).filter((e: any) => new Date(e.last_seen_at).getTime() > Date.now() - 180 * 86_400_000);
  const totalWeight = recentEdges.reduce((s: number, e: any) => s + Number(e.weight || 0), 0);
  const networkComp = clamp(Math.min(60, recentEdges.length * 4) + Math.min(40, totalWeight / 5));

  // Alerts mentioning this person via track_key (best-effort substring)
  const { data: alerts } = await sb
    .from("lookup_alerts")
    .select("severity, created_at, track_key, payload")
    .gte("created_at", since)
    .ilike("track_key", `%${name.toLowerCase()}%`).limit(50);
  const alertScore = (alerts || []).reduce((s: number, a: any) => s + (a.severity === "high" ? 8 : a.severity === "warn" ? 4 : 2), 0);
  const alertVelocity = clamp(alertScore);

  // Snapshots whose track_key contains this person's name
  const { data: snaps } = await sb
    .from("lookup_snapshots")
    .select("captured_at, spotify_popularity, track_key")
    .gte("captured_at", since)
    .ilike("track_key", `%${name.toLowerCase()}%`).limit(500);
  const points = (snaps || [])
    .filter((s: any) => typeof s.spotify_popularity === "number")
    .map((s: any) => ({ t: new Date(s.captured_at), v: s.spotify_popularity as number }));
  const slopePop = weightedSlope(points);
  const momentum = slopeToComponent(slopePop, 0.5);
  const latestPop = points.length ? points[points.length - 1].v : 0;

  // Chart presence on associated tracks
  const trackKeys = Array.from(new Set((snaps || []).map((s: any) => s.track_key))).slice(0, 25);
  let recentChartCount = 0;
  if (trackKeys.length) {
    const chartSince = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const { data: charts } = await sb
      .from("chart_placements_history")
      .select("track_key").in("track_key", trackKeys).gte("captured_on", chartSince);
    recentChartCount = (charts || []).length;
  }
  const chartComp = clamp(Math.min(100, recentChartCount * 6));

  // Signing gap proxy: writers/producers without a canonical contributor row → upside
  const signingGap = contributorId ? 30 : 70;

  const score = clamp(
    momentum * 0.25 +
    chartComp * 0.15 +
    alertVelocity * 0.15 +
    networkComp * 0.25 +
    signingGap * 0.20,
  );

  const lifecycle = lifecycleFromSignals({
    slopePopularity: slopePop,
    recentChartCount,
    alertVelocity,
    dataPoints: points.length,
    latestPopularity: latestPop,
  });

  const explanationBits: string[] = [];
  if (recentEdges.length) explanationBits.push(`${recentEdges.length} active collaborators.`);
  if (recentChartCount) explanationBits.push(`${recentChartCount} chart hits across catalog.`);
  if (slopePop > 0.2) explanationBits.push(`Catalog popularity trending up.`);
  else if (slopePop < -0.2) explanationBits.push(`Catalog popularity trending down.`);
  if (alertVelocity > 0) explanationBits.push(`${(alerts || []).length} recent alerts.`);
  if (!contributorId) explanationBits.push(`No contributor profile — likely unsigned/un-tracked.`);

  return {
    score, momentum, chartComp, alertVelocity, networkComp, signingGap,
    lifecycle, dataPoints: points.length,
    explanation: explanationBits.join(" "),
    signals: { slopePop, latestPop, recentChartCount, networkEdges: recentEdges.length, alertCount: (alerts || []).length },
  };
}

async function upsertScore(sb: any, row: any) {
  await sb.from("opportunity_scores").upsert(row, { onConflict: "entity_type,entity_key" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, KEY);

    let body: any = {};
    try { body = await req.json(); } catch { /* */ }

    let processed = 0;
    const errors: any[] = [];

    // Single-entity mode
    if (body?.entity_type && body?.entity_key) {
      try {
        const et = body.entity_type as string;
        if (et === "track") {
          const { data: t } = await sb.from("canonical_tracks")
            .select("id, title, primary_artist")
            .eq("id", body.entity_key).maybeSingle();
          const display = t ? { title: t.title, primary_artist: t.primary_artist } : { title: body.entity_key, primary_artist: "" };
          const r = await computeForTrack(sb, body.track_key || body.entity_key, t?.id ?? null, display);
          await upsertScore(sb, {
            entity_type: "track", entity_key: body.entity_key,
            display_name: display.title, primary_artist: display.primary_artist,
            track_id: t?.id ?? null,
            score: r.score, momentum_component: r.momentum, chart_component: r.chartComp,
            alert_velocity_component: r.alertVelocity, network_component: r.networkComp,
            signing_gap_component: r.signingGap,
            lifecycle_state: r.lifecycle.state, state_confidence: r.lifecycle.confidence,
            signals: r.signals, explanation: r.explanation, data_points: r.dataPoints,
            computed_at: new Date().toISOString(),
          });
          processed++;
        } else if (["artist", "writer", "producer"].includes(et)) {
          const r = await computeForPerson(sb, body.entity_key, et as any, null);
          await upsertScore(sb, {
            entity_type: et, entity_key: body.entity_key, display_name: body.entity_key,
            score: r.score, momentum_component: r.momentum, chart_component: r.chartComp,
            alert_velocity_component: r.alertVelocity, network_component: r.networkComp,
            signing_gap_component: r.signingGap,
            lifecycle_state: r.lifecycle.state, state_confidence: r.lifecycle.confidence,
            signals: r.signals, explanation: r.explanation, data_points: r.dataPoints,
            computed_at: new Date().toISOString(),
          });
          processed++;
        }
        return json({ ok: true, processed });
      } catch (e: any) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }

    // Bulk mode (cron)
    // Tracks: pick distinct track_keys with at least 1 snapshot in last 90d
    const snapSince = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: trackKeysData } = await sb
      .from("lookup_snapshots")
      .select("track_key, track_id")
      .gte("captured_at", snapSince).limit(2000);
    const seenTracks = new Map<string, string | null>();
    for (const r of (trackKeysData || []) as any[]) {
      if (!seenTracks.has(r.track_key)) seenTracks.set(r.track_key, r.track_id ?? null);
    }

    for (const [tk, tid] of seenTracks) {
      try {
        // Pull display info from canonical_tracks if present, else from track_key fallback
        let title = tk, artist = "";
        if (tid) {
          const { data: t } = await sb.from("canonical_tracks").select("title, primary_artist").eq("id", tid).maybeSingle();
          if (t) { title = t.title; artist = t.primary_artist; }
        } else {
          const parts = tk.split("::");
          title = parts[0] || tk; artist = parts[1] || "";
        }
        const r = await computeForTrack(sb, tk, tid, { title, primary_artist: artist });
        await upsertScore(sb, {
          entity_type: "track", entity_key: tk,
          display_name: title, primary_artist: artist,
          track_id: tid,
          score: r.score, momentum_component: r.momentum, chart_component: r.chartComp,
          alert_velocity_component: r.alertVelocity, network_component: r.networkComp,
          signing_gap_component: r.signingGap,
          lifecycle_state: r.lifecycle.state, state_confidence: r.lifecycle.confidence,
          signals: r.signals, explanation: r.explanation, data_points: r.dataPoints,
          computed_at: new Date().toISOString(),
        });
        processed++;
      } catch (e: any) {
        errors.push({ track_key: tk, error: e?.message || String(e) });
      }
    }

    // People: union of contributors + frequent collaborator names
    const peopleSeen = new Set<string>();
    const peopleQueue: { name: string; role: "artist" | "writer" | "producer"; contributorId: string | null }[] = [];

    const { data: contribs } = await sb
      .from("contributors")
      .select("id, name, primary_role").limit(1000);
    for (const c of (contribs || []) as any[]) {
      const role = (c.primary_role || "writer").toLowerCase();
      const r = role.includes("producer") ? "producer" : role.includes("artist") ? "artist" : "writer";
      const key = c.name.toLowerCase();
      if (peopleSeen.has(key)) continue;
      peopleSeen.add(key);
      peopleQueue.push({ name: c.name, role: r as any, contributorId: c.id });
    }
    const { data: edgePeople } = await sb
      .from("collaborator_edges").select("source_name").limit(500);
    for (const e of (edgePeople || []) as any[]) {
      const key = (e.source_name || "").toLowerCase();
      if (!key || peopleSeen.has(key)) continue;
      peopleSeen.add(key);
      peopleQueue.push({ name: e.source_name, role: "writer", contributorId: null });
    }

    for (const p of peopleQueue.slice(0, 500)) {
      try {
        const r = await computeForPerson(sb, p.name, p.role, p.contributorId);
        await upsertScore(sb, {
          entity_type: p.role, entity_key: p.name, display_name: p.name,
          contributor_id: p.contributorId,
          score: r.score, momentum_component: r.momentum, chart_component: r.chartComp,
          alert_velocity_component: r.alertVelocity, network_component: r.networkComp,
          signing_gap_component: r.signingGap,
          lifecycle_state: r.lifecycle.state, state_confidence: r.lifecycle.confidence,
          signals: r.signals, explanation: r.explanation, data_points: r.dataPoints,
          computed_at: new Date().toISOString(),
        });
        processed++;
      } catch (e: any) {
        errors.push({ person: p.name, error: e?.message || String(e) });
      }
    }

    return json({ ok: true, processed, errors_count: errors.length, errors: errors.slice(0, 20) });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});