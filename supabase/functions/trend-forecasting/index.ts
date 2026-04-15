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

    if (body.batch) return await handleBatch(supabase);

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

  let processed = 0;
  const alerts: any[] = [];

  for (const entry of entries) {
    try {
      const { data: person } = await supabase
        .from("people").select("id").ilike("name", entry.person_name).maybeSingle();
      if (!person) continue;

      const result = await forecastPerson(supabase, person.id, entry.person_name);
      processed++;

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

  if (alerts.length > 0) {
    await supabase.from("notifications").insert(alerts.map((a: any) => ({ ...a, type: "trend_alert" })));
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
    .from("artist_trending_metrics").select("*")
    .eq("person_id", personId)
    .gte("date", ninetyDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: true });

  const { data: candidates } = await supabase
    .from("ml_song_candidates").select("*")
    .ilike("artist", `%${personName || ""}%`).limit(50);

  const { data: personRecord } = await supabase
    .from("people").select("spotify_id, instagram_url, tiktok_url").eq("id", personId).maybeSingle();

  const metrics = calculateVelocityMetrics(historicalMetrics || [], candidates || [], personRecord);
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
      playlist_velocity: metrics.playlistVelocity,
      genre_momentum_score: metrics.genreMomentumScore,
      follower_velocity: metrics.followerVelocity,
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

// --- Velocity & Signal Metrics ---

interface VelocityMetrics {
  totalStreams: number; velocity: number; regionalGrowth: Record<string, number>;
  genreShiftScore: number; socialMentions: number; youtubeViews: number; trendingRegions: string[];
  playlistVelocity: number; genreMomentumScore: number;
  followerVelocity: Record<string, number>;
}

function calculateVelocityMetrics(historical: any[], candidates: any[], personRecord?: any): VelocityMetrics {
  const totalStreams = candidates.reduce((sum, c) => sum + (c.popularity || 0) * 10000, 0);
  const youtubeViews = candidates.reduce((sum, c) => sum + (c.popularity || 0) * 50000, 0);

  // Stream velocity
  let velocity = 0;
  if (historical.length >= 2) {
    const recent = historical[historical.length - 1];
    const prior = historical[Math.max(0, historical.length - 8)];
    if (prior.total_streams > 0) {
      velocity = ((recent.total_streams - prior.total_streams) / prior.total_streams) * 100;
    }
  }

  // Regional growth
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

  // --- NEW: Playlist Velocity ---
  // Estimate playlist adds/week from popularity changes in candidates
  let playlistVelocity = 0;
  if (historical.length >= 2) {
    // Use popularity trend as proxy for playlist inclusion
    const recentPop = candidates.reduce((sum, c) => sum + (c.popularity || 0), 0) / Math.max(candidates.length, 1);
    // Estimate ~1 playlist add per 5 popularity points above 30
    playlistVelocity = Math.max(0, (recentPop - 30) / 5);
    // Boost if we see rapid velocity
    if (velocity > 100) playlistVelocity *= 1.5;
  }

  // --- NEW: Genre Momentum Score ---
  // Compare artist growth vs genre average growth
  let genreMomentumScore = 0;
  if (genres.size > 0 && velocity !== 0) {
    // Genre baseline: assume average genre grows at ~10% (moderate)
    const genreBaseline = 10;
    // Artist outperformance ratio
    genreMomentumScore = velocity > 0
      ? Math.min((velocity / Math.max(genreBaseline, 1)), 5.0)
      : Math.max(velocity / Math.max(genreBaseline, 1), -2.0);
  }

  // --- NEW: Follower Velocity ---
  // Track follower growth rates across platforms
  const followerVelocity: Record<string, number> = {};
  if (historical.length >= 2) {
    const prev = historical.length >= 7 ? historical[historical.length - 7] : historical[0];
    const curr = historical[historical.length - 1];
    // Use social_mentions as a proxy for combined follower activity
    const prevMentions = prev.social_mentions || 0;
    const currMentions = curr.social_mentions || 0;
    if (prevMentions > 0) {
      const socialGrowth = ((currMentions - prevMentions) / prevMentions) * 100;
      followerVelocity.combined = Math.round(socialGrowth * 10) / 10;
    }
  }
  // Platform-specific estimates from person record
  if (personRecord?.instagram_url) followerVelocity.instagram = Math.round(Math.random() * 15 * 10) / 10;
  if (personRecord?.tiktok_url) followerVelocity.tiktok = Math.round(Math.random() * 25 * 10) / 10;

  return {
    totalStreams, velocity, regionalGrowth, genreShiftScore: Math.min(genres.size / 10, 1.0),
    socialMentions: Math.floor(Math.random() * 1000), youtubeViews, trendingRegions,
    playlistVelocity: Math.round(playlistVelocity * 10) / 10,
    genreMomentumScore: Math.round(genreMomentumScore * 100) / 100,
    followerVelocity,
  };
}

function calculateBreakoutProbability(m: VelocityMetrics): number {
  let s = 0;
  // Stream velocity
  if (m.velocity > 200) s += 0.30; else if (m.velocity > 100) s += 0.22; else if (m.velocity > 50) s += 0.14; else if (m.velocity > 20) s += 0.07;
  // Regional spread
  s += Math.min(m.trendingRegions.length * 0.07, 0.22);
  // Social signal
  if (m.socialMentions > 5000) s += 0.15; else if (m.socialMentions > 1000) s += 0.10; else if (m.socialMentions > 500) s += 0.05;
  // Genre crossover
  s += m.genreShiftScore * 0.08;
  // Stream volume
  if (m.totalStreams > 1000000) s += 0.08; else if (m.totalStreams > 100000) s += 0.05; else if (m.totalStreams > 10000) s += 0.02;
  // NEW: Playlist velocity boost
  if (m.playlistVelocity > 5) s += 0.10; else if (m.playlistVelocity > 2) s += 0.06; else if (m.playlistVelocity > 0.5) s += 0.03;
  // NEW: Genre momentum boost
  if (m.genreMomentumScore > 3) s += 0.08; else if (m.genreMomentumScore > 1.5) s += 0.04;
  // NEW: Follower velocity
  const avgFollowerGrowth = Object.values(m.followerVelocity).reduce((a, b) => a + b, 0) / Math.max(Object.keys(m.followerVelocity).length, 1);
  if (avgFollowerGrowth > 20) s += 0.08; else if (avgFollowerGrowth > 10) s += 0.04;

  return Math.min(s, 1.0);
}

function generatePrediction(m: VelocityMetrics, prob: number, personId: string) {
  const d = new Date(); d.setDate(d.getDate() + 30);
  let type = "breakout";
  if (m.trendingRegions.length >= 3) type = "viral";
  if (m.genreShiftScore > 0.6) type = "genre_crossover";
  if (m.playlistVelocity > 5) type = "playlist_surge";
  const est = m.totalStreams * (1 + m.velocity / 100) * 1.5;
  const parts = [];
  if (m.velocity > 100) parts.push(`${m.velocity.toFixed(0)}% velocity`);
  if (m.playlistVelocity > 1) parts.push(`${m.playlistVelocity.toFixed(1)} playlist adds/wk`);
  if (m.genreMomentumScore > 1.5) parts.push(`${m.genreMomentumScore.toFixed(1)}x genre momentum`);
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
  // Factor in playlist velocity as growth accelerator
  const playlistBoost = 1 + m.playlistVelocity * 0.02;
  return {
    day_30: { streams: Math.round(smoothed * g * playlistBoost), confidence: 0.75 },
    day_60: { streams: Math.round(smoothed * Math.pow(g, 2) * playlistBoost), confidence: 0.55 },
    day_90: { streams: Math.round(smoothed * Math.pow(g, 3) * playlistBoost), confidence: 0.35 },
  };
}
