// Phase 4 smart recommender.
// Combines opportunity scores, collaborator-graph proximity to the user's
// watchlist, and recency-weighted snapshot momentum.
//
// POST { user_id?, team_id?, entity_types?, limit? }
// Returns: { recommendations: [{ entity_type, entity_key, name, score, reasons[], lifecycle_state }] }

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));
    const userId: string | undefined = body?.user_id;
    const teamId: string | undefined = body?.team_id;
    const limit: number = Math.min(Number(body?.limit) || 25, 100);
    const types: string[] = Array.isArray(body?.entity_types) && body.entity_types.length
      ? body.entity_types : ["track", "writer", "producer", "artist"];

    // 1) Build the user's "tracked" set: favorites + team watchlist
    const tracked = new Map<string, string>(); // key (lowercase) -> type
    if (userId) {
      const { data: favs } = await sb.from("favorites").select("name, role").eq("user_id", userId);
      for (const f of (favs || []) as any[]) tracked.set(f.name.toLowerCase(), f.role);
    }
    if (teamId) {
      const { data: wl } = await sb.from("watchlist_entries")
        .select("person_name, person_type").eq("team_id", teamId);
      for (const w of (wl || []) as any[]) tracked.set(w.person_name.toLowerCase(), w.person_type);
    }

    // 2) Pull top opportunity scores
    const { data: scoresRaw } = await sb.from("opportunity_scores")
      .select("entity_type, entity_key, display_name, primary_artist, score, lifecycle_state, state_confidence, signals, momentum_component, network_component, signing_gap_component, alert_velocity_component, chart_component, explanation")
      .in("entity_type", types).order("score", { ascending: false }).limit(500);
    const scores = (scoresRaw || []) as any[];

    // 3) Collaborator-proximity boost: for each tracked person, find collaborators
    const proximity = new Map<string, number>(); // entity_key (lower) -> boost
    if (tracked.size > 0) {
      const trackedNames = Array.from(tracked.keys());
      const { data: edges } = await sb
        .from("collaborator_edges")
        .select("source_name, target_name, weight")
        .or(trackedNames.slice(0, 50).map((n) => `source_name.ilike.${n}`).join(","))
        .limit(2000);
      for (const e of (edges || []) as any[]) {
        const w = Number(e.weight || 1);
        const k = (e.target_name || "").toLowerCase();
        if (!k) continue;
        proximity.set(k, (proximity.get(k) || 0) + Math.min(20, w * 5));
      }
    }

    // 4) Compose final ranking
    const out = scores
      .filter((s) => !tracked.has(s.entity_key.toLowerCase()))                  // don't recommend already-tracked
      .map((s) => {
        const proxBoost = proximity.get(s.entity_key.toLowerCase()) || 0;
        const momentumBoost = Math.max(0, Number(s.momentum_component || 0) - 50) / 5; // up to ~10
        const finalScore = Math.min(100, Number(s.score || 0) + proxBoost + momentumBoost);
        const reasons: string[] = [];
        if (proxBoost > 0) reasons.push(`Collaborates with people you track (+${proxBoost.toFixed(0)})`);
        if (momentumBoost > 1) reasons.push(`Strong recent momentum (+${momentumBoost.toFixed(1)})`);
        if (s.lifecycle_state === "emerging" || s.lifecycle_state === "accelerating") reasons.push(`Lifecycle: ${s.lifecycle_state}`);
        if (Number(s.signing_gap_component) >= 60) reasons.push(`Likely unsigned upside`);
        if (Number(s.chart_component) >= 50) reasons.push(`Active on charts`);
        if (s.explanation && reasons.length === 0) reasons.push(s.explanation);
        return {
          entity_type: s.entity_type,
          entity_key: s.entity_key,
          name: s.display_name,
          primary_artist: s.primary_artist,
          base_score: Number(s.score || 0),
          score: finalScore,
          lifecycle_state: s.lifecycle_state,
          state_confidence: Number(s.state_confidence || 0),
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return json({ recommendations: out, signals: { tracked: tracked.size, candidate_pool: scores.length } });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});