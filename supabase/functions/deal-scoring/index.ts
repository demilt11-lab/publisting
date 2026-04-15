import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabase();
    const body = await req.json();

    if (body.batch) {
      return await handleBatch(supabase);
    }

    const { entry_id, team_id } = body;
    if (!entry_id || !team_id) {
      return new Response(JSON.stringify({ error: "entry_id and team_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await scoreSingleEntry(supabase, entry_id, team_id);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Deal scoring error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleBatch(supabase: any) {
  const { data: entries } = await supabase
    .from("watchlist_entries")
    .select("id, team_id, person_name, pipeline_status, created_by")
    .not("pipeline_status", "in", '("signed","passed")')
    .limit(200);

  if (!entries || entries.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  const alerts: any[] = [];

  for (const entry of entries) {
    try {
      const result = await scoreSingleEntry(supabase, entry.id, entry.team_id);
      processed++;

      // Alert if action is overdue
      if (result.score && result.next_best_action_date) {
        const actionDate = new Date(result.next_best_action_date);
        if (actionDate <= new Date()) {
          alerts.push({
            user_id: entry.created_by,
            type: "deal_action",
            title: `Action needed: ${entry.person_name}`,
            body: result.suggested_action,
            metadata: { entry_id: entry.id, score: result.score.score },
          });
        }
      }
    } catch (e) {
      console.error(`Deal scoring failed for ${entry.id}:`, e);
    }
  }

  if (alerts.length > 0) {
    await supabase.from("notifications").insert(alerts);
  }

  console.log(`Batch deal scoring: ${processed} processed, ${alerts.length} alerts`);
  return new Response(JSON.stringify({ processed, alerts: alerts.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function scoreSingleEntry(supabase: any, entryId: string, teamId: string) {
  const { data: entry } = await supabase.from("watchlist_entries").select("*").eq("id", entryId).single();
  if (!entry) throw new Error("Entry not found");

  const { data: activities } = await supabase
    .from("pipeline_activities").select("*").eq("entry_id", entryId)
    .order("created_at", { ascending: false }).limit(50);

  const { data: trendingMetrics } = await supabase
    .from("artist_trending_metrics").select("*")
    .order("date", { ascending: false }).limit(5);

  const factors = calculateDealFactors(entry, activities || [], trendingMetrics || []);
  const score = calculateDealScore(factors);
  const suggestedAction = generateSuggestedAction(entry, factors, activities || []);
  const nextBestActionDate = calculateNextActionDate(entry, activities || []);

  const { data: scoreData } = await supabase.from("deal_likelihood_scores")
    .insert({ entry_id: entryId, team_id: teamId, score, factors, suggested_action: suggestedAction, next_best_action_date: nextBestActionDate })
    .select().single();

  return { score: scoreData || { score, factors, suggested_action: suggestedAction }, activities: activities || [], suggested_action: suggestedAction, next_best_action_date: nextBestActionDate };
}

interface DealFactors { response_rate: number; fit_score: number; momentum: number; recency: number; engagement: number; pipeline_stage_weight: number; }

function calculateDealFactors(entry: any, activities: any[], trendingMetrics: any[]): DealFactors {
  const emailsSent = activities.filter(a => a.activity_type === "email_sent").length;
  const responses = activities.filter(a => ["response_received", "meeting_scheduled", "call_made"].includes(a.activity_type)).length;
  const responseRate = emailsSent > 0 ? Math.min(responses / emailsSent, 1) : 0.5;

  let fitScore = 0.5;
  if (!entry.is_major) fitScore += 0.2;
  if (entry.is_priority) fitScore += 0.15;
  if (entry.pro) fitScore += 0.1;
  fitScore = Math.min(fitScore, 1);

  let momentum = 0.3;
  if (trendingMetrics.length > 0) momentum = Math.min(0.3 + (trendingMetrics[0]?.stream_velocity || 0) / 500, 1);

  let recency = 0.5;
  if (activities.length > 0) {
    const days = (Date.now() - new Date(activities[0].created_at).getTime()) / 86400000;
    recency = days < 3 ? 1.0 : days < 7 ? 0.8 : days < 14 ? 0.5 : days < 30 ? 0.3 : 0.1;
  }

  const stageWeights: Record<string, number> = { not_contacted: 0.1, contacted: 0.3, responded: 0.5, negotiating: 0.7, terms_sent: 0.85, signed: 1.0, passed: 0.0 };

  return { response_rate: responseRate, fit_score: fitScore, momentum, recency, engagement: Math.min(activities.length / 10, 1), pipeline_stage_weight: stageWeights[entry.pipeline_status] || 0.2 };
}

function calculateDealScore(f: DealFactors): number {
  return Math.round((f.response_rate * 0.25 + f.fit_score * 0.20 + f.momentum * 0.20 + f.recency * 0.15 + f.engagement * 0.10 + f.pipeline_stage_weight * 0.10) * 100);
}

function generateSuggestedAction(entry: any, factors: DealFactors, activities: any[]): string {
  const days = activities.length > 0 ? Math.floor((Date.now() - new Date(activities[0].created_at).getTime()) / 86400000) : 999;
  const s = entry.pipeline_status;
  if (s === "not_contacted") return "Send initial outreach email — this prospect hasn't been contacted yet";
  if (s === "contacted" && days > 14) return `No response in ${days} days → Send Follow-up #2 or phone call`;
  if (s === "contacted" && days > 7) return `No response in ${days} days → Send Follow-up #1`;
  if (s === "responded" && factors.momentum > 0.6) return "High engagement + momentum → Schedule call within 48 hours";
  if (s === "responded") return "Positive response → Schedule discovery call";
  if (s === "negotiating" && days > 14) return `Stalled ${days} days → Consider final offer or pass`;
  if (s === "negotiating" && factors.momentum > 0.7) return "Momentum increasing → Expedite offer, competition likely";
  if (s === "negotiating") return "Active negotiation — prepare contract draft";
  if (s === "terms_sent" && days > 5) return `Terms sent ${days} days ago — follow up on review`;
  if (factors.momentum > 0.8 && s !== "signed") return "⚡ Momentum spiking — re-engage immediately";
  return "Review pipeline status and plan next touchpoint";
}

function calculateNextActionDate(entry: any, activities: any[]): string {
  const now = new Date();
  const daysMap: Record<string, number> = { not_contacted: 0, contacted: 5, responded: 2, negotiating: 3, terms_sent: 5 };
  let d = daysMap[entry.pipeline_status] ?? 3;
  if (activities.length > 0) {
    const since = (Date.now() - new Date(activities[0].created_at).getTime()) / 86400000;
    if (since < d) d = Math.max(1, d - Math.floor(since));
  }
  now.setDate(now.getDate() + d);
  return now.toISOString().split("T")[0];
}
