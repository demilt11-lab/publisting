// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_WEIGHTS: Record<string, number> = {
  chart_movement: 0.25,
  alert_velocity: 0.20,
  collaborator_quality: 0.20,
  snapshot_momentum: 0.20,
  outreach_signal: 0.15,
};

/**
 * Compute weight nudges from feedback history. For each feedback row, we infer
 * which signal types correlated with positive vs. negative outcomes and tilt
 * the weights up to ±15% of base. We never let any single weight go negative.
 */
function nudgeWeights(feedback: any[]): { weights: Record<string, number>; sample: number } {
  const tally: Record<string, { pos: number; neg: number }> = {};
  for (const k of Object.keys(BASE_WEIGHTS)) tally[k] = { pos: 0, neg: 0 };

  for (const f of feedback) {
    const signal = typeof f.signal === "number" ? f.signal : 0;
    const drivers: string[] = (f.payload?.drivers as string[]) ?? [];
    const positive =
      f.kind === "recommendation_accept" ||
      (f.kind === "outreach_outcome" && signal > 0) ||
      (f.kind === "score_override" && signal > 0);
    const negative =
      f.kind === "recommendation_reject" ||
      (f.kind === "outreach_outcome" && signal < 0) ||
      (f.kind === "score_override" && signal < 0);
    for (const d of drivers) {
      if (!tally[d]) continue;
      if (positive) tally[d].pos += 1;
      if (negative) tally[d].neg += 1;
    }
  }

  const adjusted: Record<string, number> = {};
  for (const [k, base] of Object.entries(BASE_WEIGHTS)) {
    const { pos, neg } = tally[k];
    const total = pos + neg;
    const tilt = total > 0 ? (pos - neg) / total : 0;
    adjusted[k] = Math.max(0.01, base * (1 + 0.15 * tilt));
  }

  // Renormalize to sum to 1
  const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(adjusted)) adjusted[k] = +(adjusted[k] / sum).toFixed(4);

  return { weights: adjusted, sample: feedback.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { team_id } = await req.json().catch(() => ({}));

    const teams: { id: string }[] = team_id ? [{ id: team_id }] : ((await admin.from("teams").select("id")).data ?? []);

    let updated = 0;
    for (const t of teams) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: fb } = await admin.from("model_feedback").select("kind,signal,payload").eq("team_id", t.id).gte("created_at", since).limit(1000);
      if (!fb || fb.length === 0) continue;
      const { weights, sample } = nudgeWeights(fb);
      await admin.from("model_weight_overlays").upsert({ team_id: t.id, model_name: "opportunity_score", weights, sample_size: sample, computed_at: new Date().toISOString() }, { onConflict: "team_id,model_name" });
      updated++;
    }

    return new Response(JSON.stringify({ updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});