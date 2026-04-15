import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { entry_id, team_id } = await req.json();
    if (!entry_id || !team_id) {
      return new Response(JSON.stringify({ error: "entry_id and team_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the watchlist entry
    const { data: entry } = await supabase
      .from("watchlist_entries")
      .select("*")
      .eq("id", entry_id)
      .single();

    if (!entry) {
      return new Response(JSON.stringify({ error: "Entry not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pipeline activities for this entry
    const { data: activities } = await supabase
      .from("pipeline_activities")
      .select("*")
      .eq("entry_id", entry_id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch trending metrics for linked person
    const { data: trendingMetrics } = await supabase
      .from("artist_trending_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(5);

    // Calculate deal likelihood score
    const factors = calculateDealFactors(entry, activities || [], trendingMetrics || []);
    const score = calculateDealScore(factors);
    const suggestedAction = generateSuggestedAction(entry, factors, activities || []);
    const nextBestActionDate = calculateNextActionDate(entry, activities || []);

    // Store the score
    const { data: scoreData } = await supabase
      .from("deal_likelihood_scores")
      .insert({
        entry_id,
        team_id,
        score,
        factors,
        suggested_action: suggestedAction,
        next_best_action_date: nextBestActionDate,
      })
      .select()
      .single();

    return new Response(JSON.stringify({
      score: scoreData || { score, factors, suggested_action: suggestedAction },
      activities: activities || [],
      suggested_action: suggestedAction,
      next_best_action_date: nextBestActionDate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Deal scoring error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface DealFactors {
  response_rate: number;
  fit_score: number;
  momentum: number;
  recency: number;
  engagement: number;
  pipeline_stage_weight: number;
}

function calculateDealFactors(entry: any, activities: any[], trendingMetrics: any[]): DealFactors {
  // Response rate: ratio of activities that got responses
  const emailsSent = activities.filter(a => a.activity_type === "email_sent").length;
  const responses = activities.filter(a => 
    ["response_received", "meeting_scheduled", "call_made"].includes(a.activity_type)
  ).length;
  const responseRate = emailsSent > 0 ? Math.min(responses / emailsSent, 1) : 0.5;

  // Fit score: based on entry metadata
  let fitScore = 0.5;
  if (!entry.is_major) fitScore += 0.2; // Unsigned = more opportunity
  if (entry.is_priority) fitScore += 0.15;
  if (entry.pro) fitScore += 0.1; // Has PRO = professional
  fitScore = Math.min(fitScore, 1);

  // Momentum: from trending metrics
  let momentum = 0.3;
  if (trendingMetrics.length > 0) {
    const latestVelocity = trendingMetrics[0]?.stream_velocity || 0;
    momentum = Math.min(0.3 + latestVelocity / 500, 1);
  }

  // Recency: days since last activity
  let recency = 0.5;
  if (activities.length > 0) {
    const lastActivity = new Date(activities[0].created_at);
    const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 3) recency = 1.0;
    else if (daysSince < 7) recency = 0.8;
    else if (daysSince < 14) recency = 0.5;
    else if (daysSince < 30) recency = 0.3;
    else recency = 0.1;
  }

  // Engagement: total number of meaningful activities
  const engagement = Math.min(activities.length / 10, 1);

  // Pipeline stage weight
  const stageWeights: Record<string, number> = {
    not_contacted: 0.1,
    contacted: 0.3,
    responded: 0.5,
    negotiating: 0.7,
    terms_sent: 0.85,
    signed: 1.0,
    passed: 0.0,
  };
  const pipelineStageWeight = stageWeights[entry.pipeline_status] || 0.2;

  return { response_rate: responseRate, fit_score: fitScore, momentum, recency, engagement, pipeline_stage_weight: pipelineStageWeight };
}

function calculateDealScore(factors: DealFactors): number {
  return Math.round(
    (factors.response_rate * 0.25 +
     factors.fit_score * 0.20 +
     factors.momentum * 0.20 +
     factors.recency * 0.15 +
     factors.engagement * 0.10 +
     factors.pipeline_stage_weight * 0.10) * 100
  );
}

function generateSuggestedAction(entry: any, factors: DealFactors, activities: any[]): string {
  const daysSinceContact = activities.length > 0
    ? Math.floor((Date.now() - new Date(activities[0].created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const status = entry.pipeline_status;

  if (status === "not_contacted") {
    return "Send initial outreach email — this prospect hasn't been contacted yet";
  }
  if (status === "contacted" && daysSinceContact > 7) {
    return `No response in ${daysSinceContact} days → Send Follow-up #1`;
  }
  if (status === "contacted" && daysSinceContact > 14) {
    return `No response in ${daysSinceContact} days → Send Follow-up #2 or phone call`;
  }
  if (status === "responded" && factors.momentum > 0.6) {
    return "High engagement + momentum increasing → Schedule call within 48 hours";
  }
  if (status === "responded") {
    return "Positive response received → Schedule discovery call to discuss terms";
  }
  if (status === "negotiating" && daysSinceContact > 14) {
    return `Stalled in negotiation for ${daysSinceContact} days → Consider final offer or move to passed`;
  }
  if (status === "negotiating" && factors.momentum > 0.7) {
    return "Momentum increasing → Expedite offer, competition likely";
  }
  if (status === "negotiating") {
    return "Active negotiation — review terms and prepare contract draft";
  }
  if (status === "terms_sent" && daysSinceContact > 5) {
    return `Terms sent ${daysSinceContact} days ago — follow up on contract review`;
  }
  if (factors.momentum > 0.8 && status !== "signed") {
    return "⚡ Streaming momentum spiking — re-engage immediately before competition";
  }

  return "Review pipeline status and plan next touchpoint";
}

function calculateNextActionDate(entry: any, activities: any[]): string {
  const now = new Date();
  const status = entry.pipeline_status;

  let daysUntilAction = 3; // Default
  if (status === "not_contacted") daysUntilAction = 0;
  else if (status === "contacted") daysUntilAction = 5;
  else if (status === "responded") daysUntilAction = 2;
  else if (status === "negotiating") daysUntilAction = 3;
  else if (status === "terms_sent") daysUntilAction = 5;

  // If last activity was recent, push the date out
  if (activities.length > 0) {
    const lastActivity = new Date(activities[0].created_at);
    const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < daysUntilAction) {
      daysUntilAction = Math.max(1, daysUntilAction - Math.floor(daysSince));
    }
  }

  now.setDate(now.getDate() + daysUntilAction);
  return now.toISOString().split("T")[0];
}
