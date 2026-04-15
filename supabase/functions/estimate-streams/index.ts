import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Genre baseline average monthly streams (conservative estimates)
const GENRE_BASELINES: Record<string, { avgMonthlyStreams: number; stdDev: number }> = {
  pop: { avgMonthlyStreams: 500000, stdDev: 300000 },
  "hip-hop": { avgMonthlyStreams: 400000, stdDev: 250000 },
  "r&b": { avgMonthlyStreams: 300000, stdDev: 200000 },
  electronic: { avgMonthlyStreams: 200000, stdDev: 150000 },
  rock: { avgMonthlyStreams: 250000, stdDev: 180000 },
  country: { avgMonthlyStreams: 200000, stdDev: 120000 },
  latin: { avgMonthlyStreams: 350000, stdDev: 200000 },
  punjabi: { avgMonthlyStreams: 300000, stdDev: 180000 },
  default: { avgMonthlyStreams: 200000, stdDev: 150000 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { title, artist, genre, popularity, playlist_count, chart_positions, follower_count, social_mentions } = body;

    if (!title || !artist) {
      return new Response(JSON.stringify({ error: "title and artist required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const estimate = estimateStreams({
      genre: genre || "default",
      popularity: popularity || 0,
      playlistCount: playlist_count || 0,
      chartPositions: chart_positions || [],
      followerCount: follower_count || 0,
      socialMentions: social_mentions || 0,
    });

    return new Response(JSON.stringify({
      success: true,
      title,
      artist,
      estimate: {
        low: Math.round(estimate.low),
        mid: Math.round(estimate.mid),
        high: Math.round(estimate.high),
        confidence: estimate.confidence,
        confidence_label: estimate.confidence >= 70 ? "High" : estimate.confidence >= 50 ? "Moderate" : "Low",
        display: `Est. ${formatStreams(estimate.low)}-${formatStreams(estimate.high)} streams (${estimate.confidence}% confidence)`,
        factors_used: estimate.factorsUsed,
        is_estimate: true,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface EstimateInput {
  genre: string;
  popularity: number;
  playlistCount: number;
  chartPositions: Array<{ chart: string; peak: number }>;
  followerCount: number;
  socialMentions: number;
}

function estimateStreams(input: EstimateInput) {
  const baseline = GENRE_BASELINES[input.genre.toLowerCase()] || GENRE_BASELINES.default;
  let estimate = baseline.avgMonthlyStreams;
  let confidence = 30; // Start low
  const factorsUsed: string[] = [];

  // Factor 1: Spotify popularity (0-100)
  if (input.popularity > 0) {
    // Popularity follows a roughly logarithmic scale
    const popMultiplier = Math.pow(input.popularity / 50, 2.5);
    estimate *= popMultiplier;
    confidence += 15;
    factorsUsed.push(`Popularity: ${input.popularity}`);
  }

  // Factor 2: Playlist placement count
  if (input.playlistCount > 0) {
    const playlistMultiplier = 1 + Math.log10(input.playlistCount + 1) * 0.5;
    estimate *= playlistMultiplier;
    confidence += 10;
    factorsUsed.push(`${input.playlistCount} playlists`);
  }

  // Factor 3: Chart positions
  if (input.chartPositions.length > 0) {
    const bestPosition = Math.min(...input.chartPositions.map(c => c.peak));
    const chartMultiplier = bestPosition <= 10 ? 3.0 : bestPosition <= 50 ? 1.8 : bestPosition <= 100 ? 1.3 : 1.1;
    estimate *= chartMultiplier;
    confidence += 15;
    factorsUsed.push(`Chart peak: #${bestPosition}`);
  }

  // Factor 4: Artist follower count
  if (input.followerCount > 0) {
    const followerMultiplier = Math.pow(input.followerCount / 100000, 0.3);
    estimate *= Math.max(0.5, Math.min(followerMultiplier, 5));
    confidence += 10;
    factorsUsed.push(`${formatStreams(input.followerCount)} followers`);
  }

  // Factor 5: Social media velocity
  if (input.socialMentions > 0) {
    const socialMultiplier = 1 + Math.log10(input.socialMentions + 1) * 0.3;
    estimate *= socialMultiplier;
    confidence += 5;
    factorsUsed.push(`${input.socialMentions} social mentions`);
  }

  // Annual estimate (multiply monthly by 12)
  const annualEstimate = estimate * 12;
  confidence = Math.min(85, confidence); // Cap confidence

  // Calculate range based on confidence
  const uncertaintyFactor = (100 - confidence) / 100;
  const low = annualEstimate * (1 - uncertaintyFactor);
  const high = annualEstimate * (1 + uncertaintyFactor);

  return { low, mid: annualEstimate, high, confidence, factorsUsed };
}

function formatStreams(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}
