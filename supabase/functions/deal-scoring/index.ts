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

    if (body.pipeline_health) {
      return await getPipelineHealth(supabase, body.team_id);
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

// --- Pipeline Health Analytics ---
async function getPipelineHealth(supabase: any, teamId: string) {
  if (!teamId) {
    return new Response(JSON.stringify({ error: "team_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: entries } = await supabase
    .from("watchlist_entries")
    .select("id, pipeline_status, created_at, updated_at, person_name")
    .eq("team_id", teamId);

  const { data: activities } = await supabase
    .from("pipeline_activities")
    .select("entry_id, activity_type, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  const { data: scores } = await supabase
    .from("deal_likelihood_scores")
    .select("entry_id, score, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const allEntries = entries || [];
  const allActivities = activities || [];
  const allScores = scores || [];

  // Stage distribution
  const stageDistribution: Record<string, number> = {};
  allEntries.forEach((e: any) => {
    stageDistribution[e.pipeline_status] = (stageDistribution[e.pipeline_status] || 0) + 1;
  });

  // Avg time per stage (estimate from created_at to updated_at)
  const stageTimeDays: Record<string, number[]> = {};
  allEntries.forEach((e: any) => {
    const days = (new Date(e.updated_at).getTime() - new Date(e.created_at).getTime()) / 86400000;
    if (!stageTimeDays[e.pipeline_status]) stageTimeDays[e.pipeline_status] = [];
    stageTimeDays[e.pipeline_status].push(days);
  });

  const avgTimePerStage: Record<string, number> = {};
  Object.entries(stageTimeDays).forEach(([stage, days]) => {
    avgTimePerStage[stage] = Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
  });

  // Conversion funnel
  const stageOrder = ["not_contacted", "contacted", "responded", "negotiating", "terms_sent", "signed"];
  const funnel = stageOrder.map(stage => ({
    stage,
    count: stageDistribution[stage] || 0,
  }));

  // Activity velocity (activities per week over last 4 weeks)
  const fourWeeksAgo = Date.now() - 28 * 86400000;
  const recentActivities = allActivities.filter((a: any) => new Date(a.created_at).getTime() > fourWeeksAgo);
  const weeklyVelocity = [0, 0, 0, 0];
  recentActivities.forEach((a: any) => {
    const weekIndex = Math.min(3, Math.floor((Date.now() - new Date(a.created_at).getTime()) / (7 * 86400000)));
    weeklyVelocity[3 - weekIndex]++;
  });

  // Score distribution
  const latestScores = new Map<string, number>();
  allScores.forEach((s: any) => {
    if (!latestScores.has(s.entry_id)) latestScores.set(s.entry_id, s.score);
  });
  const scoreDistribution = { high: 0, medium: 0, low: 0 };
  latestScores.forEach(score => {
    if (score >= 70) scoreDistribution.high++;
    else if (score >= 40) scoreDistribution.medium++;
    else scoreDistribution.low++;
  });

  // Stalled deals (no activity in 14+ days)
  const stalledEntries: any[] = [];
  allEntries.forEach((e: any) => {
    if (["signed", "passed"].includes(e.pipeline_status)) return;
    const entryActivities = allActivities.filter((a: any) => a.entry_id === e.id);
    const lastActivity = entryActivities.length > 0
      ? new Date(entryActivities[entryActivities.length - 1].created_at).getTime()
      : new Date(e.created_at).getTime();
    const daysSince = (Date.now() - lastActivity) / 86400000;
    if (daysSince > 14) {
      stalledEntries.push({ id: e.id, person_name: e.person_name, days_stalled: Math.floor(daysSince), stage: e.pipeline_status });
    }
  });

  // Conversion rate (signed / total non-passed)
  const total = allEntries.filter((e: any) => e.pipeline_status !== "passed").length;
  const signed = stageDistribution["signed"] || 0;
  const conversionRate = total > 0 ? Math.round((signed / total) * 100) : 0;

  const result = {
    stage_distribution: stageDistribution,
    avg_time_per_stage: avgTimePerStage,
    funnel,
    weekly_velocity: weeklyVelocity,
    score_distribution: scoreDistribution,
    stalled_entries: stalledEntries.slice(0, 10),
    conversion_rate: conversionRate,
    total_active: total,
    total_signed: signed,
    total_passed: stageDistribution["passed"] || 0,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Batch scoring with auto-advance ---
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

      // Auto-advance: check if milestones suggest stage change
      const autoAdvance = checkAutoAdvance(entry, result);
      if (autoAdvance) {
        await supabase.from("watchlist_entries").update({ pipeline_status: autoAdvance.newStage }).eq("id", entry.id);
        await supabase.from("pipeline_activities").insert({
          entry_id: entry.id, team_id: entry.team_id, activity_type: "stage_auto_advanced",
          details: { from: entry.pipeline_status, to: autoAdvance.newStage, reason: autoAdvance.reason },
          created_by: entry.created_by,
        });
        alerts.push({
          user_id: entry.created_by, type: "deal_action",
          title: `📈 ${entry.person_name} auto-advanced to ${formatStage(autoAdvance.newStage)}`,
          body: autoAdvance.reason,
          metadata: { entry_id: entry.id, auto_advance: true },
        });
      }

      // Alert if action is overdue
      if (result.score && result.next_best_action_date) {
        const actionDate = new Date(result.next_best_action_date);
        if (actionDate <= new Date()) {
          alerts.push({
            user_id: entry.created_by, type: "deal_action",
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

function formatStage(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface AutoAdvanceResult { newStage: string; reason: string; }

function checkAutoAdvance(entry: any, result: any): AutoAdvanceResult | null {
  const activities = result.activities || [];
  const status = entry.pipeline_status;

  // not_contacted → contacted: if email_sent exists
  if (status === "not_contacted" && activities.some((a: any) => a.activity_type === "email_sent")) {
    return { newStage: "contacted", reason: "First outreach email sent" };
  }

  // contacted → responded: if response_received
  if (status === "contacted" && activities.some((a: any) => a.activity_type === "response_received")) {
    return { newStage: "responded", reason: "Response received from prospect" };
  }

  // responded → negotiating: if meeting_scheduled or multiple responses
  if (status === "responded") {
    const meetings = activities.filter((a: any) => a.activity_type === "meeting_scheduled").length;
    const responses = activities.filter((a: any) => a.activity_type === "response_received").length;
    if (meetings >= 1 || responses >= 3) {
      return { newStage: "negotiating", reason: meetings >= 1 ? "Meeting scheduled with prospect" : "Multiple responses indicate active discussion" };
    }
  }

  // negotiating → terms_sent: if contract_sent
  if (status === "negotiating" && activities.some((a: any) => a.activity_type === "contract_sent")) {
    return { newStage: "terms_sent", reason: "Contract/terms sent to prospect" };
  }

  return null;
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

interface DealFactors {
  response_rate: number; fit_score: number; momentum: number; recency: number;
  engagement: number; pipeline_stage_weight: number; activity_density: number; multi_channel: number;
}

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

  // Activity density: how many activities per week
  const twoWeeksActivities = activities.filter(a => (Date.now() - new Date(a.created_at).getTime()) < 14 * 86400000);
  const activityDensity = Math.min(twoWeeksActivities.length / 6, 1);

  // Multi-channel bonus: using multiple communication types
  const channelTypes = new Set(activities.map(a => a.activity_type));
  const multiChannel = Math.min(channelTypes.size / 4, 1);

  const stageWeights: Record<string, number> = { not_contacted: 0.1, contacted: 0.3, responded: 0.5, negotiating: 0.7, terms_sent: 0.85, signed: 1.0, passed: 0.0 };

  return {
    response_rate: responseRate, fit_score: fitScore, momentum, recency,
    engagement: Math.min(activities.length / 10, 1),
    pipeline_stage_weight: stageWeights[entry.pipeline_status] || 0.2,
    activity_density: activityDensity,
    multi_channel: multiChannel,
  };
}

function calculateDealScore(f: DealFactors): number {
  return Math.round((
    f.response_rate * 0.20 +
    f.fit_score * 0.15 +
    f.momentum * 0.15 +
    f.recency * 0.15 +
    f.engagement * 0.08 +
    f.pipeline_stage_weight * 0.12 +
    f.activity_density * 0.08 +
    f.multi_channel * 0.07
  ) * 100);
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