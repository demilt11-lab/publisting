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

    const { user_id, songs, methodology, assumptions } = await req.json();
    if (!user_id || !songs || !Array.isArray(songs)) {
      return new Response(JSON.stringify({ error: "user_id and songs array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const method = methodology || "income_approach";
    const config = {
      discount_rate: assumptions?.discount_rate || 0.12,
      growth_rate: assumptions?.growth_rate || 0.15,
      terminal_growth_rate: assumptions?.terminal_growth_rate || 0.03,
      multiple: assumptions?.multiple || 18,
      simulations: assumptions?.simulations || 10000,
      ...assumptions,
    };

    // Fetch market multiples for comparable analysis
    const { data: multiples } = await supabase
      .from("market_multiples")
      .select("*")
      .eq("verified", true)
      .order("transaction_date", { ascending: false })
      .limit(20);

    // Fetch streaming rates for revenue calculation
    const { data: rates } = await supabase
      .from("streaming_rates")
      .select("*")
      .is("effective_to", null)
      .limit(100);

    // Calculate per-song valuations
    const songValuations = songs.map((song: any) => {
      const annualRevenue = calculateSongAnnualRevenue(song, rates || []);
      let value = 0;

      switch (method) {
        case "income_approach":
          value = calculateDCF(annualRevenue, config);
          break;
        case "market_multiple":
          value = annualRevenue * getMedianMultiple(multiples || [], song.genre);
          break;
        case "monte_carlo":
          value = runMonteCarloForSong(annualRevenue, config).median;
          break;
        default:
          value = annualRevenue * config.multiple;
      }

      return {
        song_id: song.id || song.title,
        title: song.title,
        artist: song.artist,
        annual_revenue: Math.round(annualRevenue * 100) / 100,
        value: Math.round(value * 100) / 100,
        ownership_percent: song.ownership_percent || 100,
        contributed_value: Math.round(value * (song.ownership_percent || 100) / 100 * 100) / 100,
      };
    });

    const totalValue = songValuations.reduce((sum: number, s: any) => sum + s.contributed_value, 0);
    const totalAnnualRevenue = songValuations.reduce((sum: number, s: any) => sum + s.annual_revenue, 0);

    // Monte Carlo confidence interval for total portfolio
    const mcResult = runMonteCarlo(totalAnnualRevenue, config);

    // Concentration risk
    const sortedByValue = [...songValuations].sort((a: any, b: any) => b.contributed_value - a.contributed_value);
    const top3Value = sortedByValue.slice(0, 3).reduce((s: number, v: any) => s + v.contributed_value, 0);
    const concentrationRisk = totalValue > 0 ? top3Value / totalValue : 0;

    // Genre diversification
    const genres = new Set(songs.map((s: any) => s.genre).filter(Boolean));
    const genreDiversification = Math.min(genres.size / 5, 1);

    // Store valuation
    const { data: valuation } = await supabase
      .from("catalog_valuations")
      .insert({
        user_id,
        total_value: totalValue,
        methodology: method,
        assumptions: config,
        song_valuations: songValuations,
        confidence_interval: mcResult,
      })
      .select()
      .single();

    return new Response(JSON.stringify({
      valuation: valuation || { total_value: totalValue, methodology: method },
      song_valuations: songValuations,
      confidence_interval: mcResult,
      risk_metrics: {
        concentration_risk: Math.round(concentrationRisk * 100),
        genre_diversification: Math.round(genreDiversification * 100),
        top_3_percentage: Math.round(concentrationRisk * 100),
      },
      market_comparables: (multiples || []).slice(0, 5),
      median_market_multiple: getMedianMultiple(multiples || []),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Catalog valuation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calculateSongAnnualRevenue(song: any, rates: any[]): number {
  const spotifyStreams = song.spotify_streams || 0;
  const youtubeViews = song.youtube_views || 0;
  const ownershipPercent = (song.ownership_percent || 100) / 100;

  // Find best rate for country
  const getRate = (platform: string, country: string = "US"): number => {
    const rate = rates.find(r => r.platform === platform && r.country_code === country);
    return rate ? parseFloat(rate.rate_per_stream) : (platform === "spotify" ? 0.00437 : 0.00182);
  };

  const spotifyRate = getRate("spotify", song.country || "US");
  const youtubeRate = getRate("youtube", song.country || "US");

  // Annual revenue = monthly * 12
  const monthlySpotifyRevenue = spotifyStreams * spotifyRate;
  const monthlyYoutubeRevenue = youtubeViews * youtubeRate;
  const mechanicalRevenue = (monthlySpotifyRevenue + monthlyYoutubeRevenue) * 12;
  const performanceRevenue = mechanicalRevenue * 0.15; // PRO share

  return (mechanicalRevenue + performanceRevenue) * ownershipPercent;
}

function calculateDCF(annualRevenue: number, config: any): number {
  const { discount_rate, growth_rate, terminal_growth_rate } = config;
  let totalPV = 0;
  let lastYearRevenue = annualRevenue;

  // 5-year projected cash flows
  for (let year = 1; year <= 5; year++) {
    const projectedRevenue = annualRevenue * Math.pow(1 + growth_rate, year);
    const discountedRevenue = projectedRevenue / Math.pow(1 + discount_rate, year);
    totalPV += discountedRevenue;
    lastYearRevenue = projectedRevenue;
  }

  // Terminal value
  const terminalValue = lastYearRevenue * (1 + terminal_growth_rate) / (discount_rate - terminal_growth_rate);
  const discountedTerminal = terminalValue / Math.pow(1 + discount_rate, 5);

  return totalPV + discountedTerminal;
}

function getMedianMultiple(multiples: any[], genre?: string): number {
  let filtered = multiples;
  if (genre) {
    const genreFiltered = multiples.filter(m => m.genre === genre);
    if (genreFiltered.length >= 3) filtered = genreFiltered;
  }

  if (filtered.length === 0) return 18; // Default

  const sorted = filtered.map(m => m.multiple).sort((a: number, b: number) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function runMonteCarlo(annualRevenue: number, config: any) {
  const simulations = Math.min(config.simulations || 10000, 10000);
  const outcomes: number[] = [];

  for (let i = 0; i < simulations; i++) {
    const growthRate = randomNormal(config.growth_rate, 0.05);
    const multiple = randomNormal(config.multiple, 3);
    const churnRate = randomNormal(0.05, 0.02);

    let revenue = annualRevenue;
    for (let year = 1; year <= 5; year++) {
      revenue *= (1 + growthRate - Math.max(churnRate, 0));
    }

    outcomes.push(revenue * Math.max(multiple, 5));
  }

  outcomes.sort((a, b) => a - b);

  return {
    low: Math.round(outcomes[Math.floor(simulations * 0.1)] * 100) / 100,
    mid: Math.round(outcomes[Math.floor(simulations * 0.5)] * 100) / 100,
    high: Math.round(outcomes[Math.floor(simulations * 0.9)] * 100) / 100,
    mean: Math.round(outcomes.reduce((a, b) => a + b, 0) / simulations * 100) / 100,
    p5: Math.round(outcomes[Math.floor(simulations * 0.05)] * 100) / 100,
    p95: Math.round(outcomes[Math.floor(simulations * 0.95)] * 100) / 100,
  };
}

function runMonteCarloForSong(annualRevenue: number, config: any) {
  return runMonteCarlo(annualRevenue, { ...config, simulations: 1000 });
}

function randomNormal(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}
