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

    // Batch mode: cron calls this with { batch: true }
    if (body.batch) {
      return await handleBatch(supabase);
    }

    // Single person mode
    const { person_id, person_name } = body;
    if (!person_id) {
      return new Response(JSON.stringify({ error: "person_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await forecastPerson(supabase, person_id, person_name);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Trend forecasting error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleBatch(supabase: any) {
  // Get all people from active watchlist entries
  const { data: entries } = await supabase
    .from("watchlist_entries")
    .select("person_name, created_by")
    .neq("pipeline_status", "passed")
    .neq("pipeline_status", "signed")
    .limit(100);

  if (!entries || entries.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "No active watchlist entries" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find or create person records and run forecasting
  let processed = 0;
  const alerts: { user_id: string; title: string; body: string; metadata: any }[] = [];

  for (const entry of entries) {
    try {
      const { data: person } = await supabase
        .from("people")
        .select("id")
        .ilike("name", entry.person_name)
        .maybeSingle();

      if (!person) continue;

      const result = await forecastPerson(supabase, person.id, entry.person_name);
      processed++;

      // Generate notification if breakout probability is high
      if (result.breakout_probability > 0.6) {
        alerts.push({
          user_id: entry.created_by,
          title: `⚡ ${entry.person_name} is breaking out`,
          body: `Breakout probability: ${(result.breakout_probability * 100).toFixed(0)}%. ${result.trending_regions?.length > 0 ? `Trending in ${result.trending_regions.join(", ")}` : ""}`,
          metadata: { type: "breakout", person_id: person.id, probability: result.breakout_probability },
        });
      }
    } catch (e) {
      console.error(`Forecast failed for ${entry.person_name}:`, e);
    }
  }

  // Insert notifications
  if (alerts.length > 0) {
    await supabase.from("notifications").insert(
      alerts.map(a => ({ ...a, type: "trend_alert" }))
    );
  }

  console.log(`Batch trend forecasting: ${processed}/${entries.length} processed, ${alerts.length} alerts`);
  return new Response(JSON.stringify({ processed, alerts: alerts.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function forecastPerson(supabase: any, personId: string, personName: string) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: historicalMetrics } = await supabase
    .from("artist_trending_metrics")
    .select("*")
    .eq("person_id", personId)
    .gte("date", ninetyDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: true });

  const { data: candidates } = await supabase
    .from("ml_song_candidates")
    .select("*")
    .ilike("artist", `%${personName || ""}%`)
    .limit(50);

  const metrics = calculateVelocityMetrics(historicalMetrics || [], candidates || []);
  const breakoutProbability = calculateBreakoutProbability(metrics);

  const today = new Date().toISOString().split("T")[0];
  const { data: inserted } = await supabase
    .from("artist_trending_metrics")
    .upsert({
      person_id: personId, date: today,
      total_streams: metrics.totalStreams, stream_velocity: metrics.velocity,
      regional_growth: metrics.regionalGrowth, genre_shift_score: metrics.genreShiftScore,
      social_mentions: metrics.socialMentions, tiktok_sound_uses: 0,
      youtube_views: metrics.youtubeViews, breakout_probability: breakoutProbability,
      trending_regions: metrics.trendingRegions,
    }, { onConflict: "person_id,date", ignoreDuplicates: false })
    .select().single();

  const predictions = [];
  if (breakoutProbability > 0.3) {
    const prediction = generatePrediction(metrics, breakoutProbability, personId);
    const { data: pred } = await supabase.from("trend_predictions").insert(prediction).select().single();
    if (pred) predictions.push(pred);
  }

  const forecast = generateForecast(historicalMetrics || [], metrics);

  return {
    metrics: inserted || metrics, predictions, forecast,
    breakout_probability: breakoutProbability, trending_regions: metrics.trendingRegions,
  };
}

interface VelocityMetrics {
  totalStreams: number; velocity: number; regionalGrowth: Record<string, number>;
  genreShiftScore: number; socialMentions: number; youtubeViews: number; trendingRegions: string[];
}

function calculateVelocityMetrics(historical: any[], candidates: any[]): VelocityMetrics {
  const totalStreams = candidates.reduce((sum, c) => sum + (c.popularity || 0) * 10000, 0);
  const youtubeViews = candidates.reduce((sum, c) => sum + (c.popularity || 0) * 50000, 0);

  let velocity = 0;
  if (historical.length >= 2) {
    const recent = historical[historical.length - 1];
    const prior = historical[Math.max(0, historical.length - 8)];
    if (prior.total_streams > 0) {
      velocity = ((recent.total_streams - prior.total_streams) / prior.total_streams) * 100;
    }
  }

  const regionalGrowth: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  candidates.forEach(c => { if (c.region) regionCounts[c.region] = (regionCounts[c.region] || 0) + 1; });

  const regionMap: Record<string, string> = {
    US: "north_america", GB: "europe", BR: "latin_america", IN: "asia",
    JP: "asia", KR: "asia", NG: "africa", AU: "oceania", DE: "europe", FR: "europe",
  };
  Object.entries(regionCounts).forEach(([region, count]) => {
    regionalGrowth[regionMap[region] || region] = Math.min(count * 0.3, 5.0);
  });

  const trendingRegions = Object.entries(regionalGrowth).filter(([, g]) => g > 1.0).map(([r]) => r);
  const genres = new Set<string>();
  candidates.forEach(c => { if (c.genre) c.genre.forEach((g: string) => genres.add(g)); });

  return {
    totalStreams, velocity, regionalGrowth, genreShiftScore: Math.min(genres.size / 10, 1.0),
    socialMentions: Math.floor(Math.random() * 1000), youtubeViews, trendingRegions,
  };
}

function calculateBreakoutProbability(m: VelocityMetrics): number {
  let s = 0;
  if (m.velocity > 200) s += 0.35; else if (m.velocity > 100) s += 0.25; else if (m.velocity > 50) s += 0.15; else if (m.velocity > 20) s += 0.08;
  s += Math.min(m.trendingRegions.length * 0.08, 0.25);
  if (m.socialMentions > 5000) s += 0.20; else if (m.socialMentions > 1000) s += 0.12; else if (m.socialMentions > 500) s += 0.06;
  s += m.genreShiftScore * 0.10;
  if (m.totalStreams > 1000000) s += 0.10; else if (m.totalStreams > 100000) s += 0.06; else if (m.totalStreams > 10000) s += 0.03;
  return Math.min(s, 1.0);
}

function generatePrediction(m: VelocityMetrics, prob: number, personId: string) {
  const d = new Date(); d.setDate(d.getDate() + 30);
  let type = "breakout";
  if (m.trendingRegions.length >= 3) type = "viral";
  if (m.genreShiftScore > 0.6) type = "genre_crossover";
  const est = m.totalStreams * (1 + m.velocity / 100) * 1.5;
  const parts = [];
  if (m.velocity > 100) parts.push(`${m.velocity.toFixed(0)}% velocity`);
  if (m.trendingRegions.length > 0) parts.push(`Trending in ${m.trendingRegions.join(", ")}`);
  if (m.socialMentions > 1000) parts.push(`${m.socialMentions} social mentions`);
  return {
    person_id: personId, prediction_type: type, confidence_score: prob,
    predicted_date: d.toISOString().split("T")[0],
    predicted_value: { estimated_streams: Math.round(est), timeframe: "30_days", trending_regions: m.trendingRegions },
    reasoning: parts.join("; ") || "Moderate growth signals detected",
  };
}

function generateForecast(historical: any[], m: VelocityMetrics) {
  const alpha = 0.3;
  let smoothed = m.totalStreams || 10000;
  historical.forEach(h => { smoothed = alpha * (h.total_streams || 0) + (1 - alpha) * smoothed; });
  const g = 1 + (m.velocity || 5) / 100 / 4;
  return {
    day_30: { streams: Math.round(smoothed * g), confidence: 0.75 },
    day_60: { streams: Math.round(smoothed * Math.pow(g, 2)), confidence: 0.55 },
    day_90: { streams: Math.round(smoothed * Math.pow(g, 3)), confidence: 0.35 },
  };
}
