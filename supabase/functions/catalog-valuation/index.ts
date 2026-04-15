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

    const { user_id, songs, methodology, assumptions } = body;
    if (!user_id || !songs || !Array.isArray(songs)) {
      return new Response(JSON.stringify({ error: "user_id and songs array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await valuateCatalog(supabase, user_id, songs, methodology, assumptions);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Catalog valuation error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleBatch(supabase: any) {
  const { data: analyses } = await supabase
    .from("catalog_analyses")
    .select("user_id, catalog_json, name")
    .order("updated_at", { ascending: false }).limit(50);

  if (!analyses || analyses.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const byUser = new Map<string, any>();
  for (const a of analyses) { if (!byUser.has(a.user_id)) byUser.set(a.user_id, a); }

  let processed = 0;
  const alerts: any[] = [];

  for (const [userId, analysis] of byUser) {
    try {
      const songs = Array.isArray(analysis.catalog_json) ? analysis.catalog_json : [];
      if (songs.length === 0) continue;

      const result = await valuateCatalog(supabase, userId, songs, "income_approach", {});
      processed++;

      const { data: prevVals } = await supabase
        .from("catalog_valuations").select("total_value")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(2);

      if (prevVals && prevVals.length >= 2) {
        const current = prevVals[0].total_value || 0;
        const previous = prevVals[1].total_value || 1;
        const growth = ((current - previous) / previous) * 100;

        if (Math.abs(growth) > 5) {
          alerts.push({
            user_id: userId, type: "valuation_update",
            title: `Catalog value ${growth > 0 ? "increased" : "decreased"} ${Math.abs(growth).toFixed(1)}%`,
            body: `Your catalog "${analysis.name}" is now valued at $${current.toLocaleString()}`,
            metadata: { growth, current_value: current, previous_value: previous },
          });
        }
      }
    } catch (e) {
      console.error(`Valuation failed for user ${userId}:`, e);
    }
  }

  if (alerts.length > 0) await supabase.from("notifications").insert(alerts);

  return new Response(JSON.stringify({ processed, alerts: alerts.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function valuateCatalog(supabase: any, userId: string, songs: any[], methodology?: string, assumptions?: any) {
  const method = methodology || "income_approach";
  const config = {
    discount_rate: assumptions?.discount_rate || 0.12,
    growth_rate: assumptions?.growth_rate || 0.15,
    terminal_growth_rate: assumptions?.terminal_growth_rate || 0.03,
    multiple: assumptions?.multiple || 18,
    simulations: assumptions?.simulations || 10000,
    decay_rate: assumptions?.decay_rate || 0.05,
    copyright_years_remaining: assumptions?.copyright_years_remaining || 50,
    ...assumptions,
  };

  const { data: multiples } = await supabase.from("market_multiples").select("*").eq("verified", true).order("transaction_date", { ascending: false }).limit(20);
  const { data: rates } = await supabase.from("streaming_rates").select("*").is("effective_to", null).limit(100);

  const songValuations = songs.map((song: any) => {
    const annualRevenue = calculateSongAnnualRevenue(song, rates || []);
    const decayAdjustedRevenue = applyDecayModel(annualRevenue, config.decay_rate, song.release_year);

    let value = 0;
    switch (method) {
      case "income_approach": value = calculateDCF(decayAdjustedRevenue, config); break;
      case "market_multiple": value = decayAdjustedRevenue * getMedianMultiple(multiples || [], song.genre); break;
      case "monte_carlo": value = runMonteCarlo(decayAdjustedRevenue, { ...config, simulations: 1000 }).mid; break;
      default: value = decayAdjustedRevenue * config.multiple;
    }

    // Copyright expiry discount
    const yearsRemaining = song.copyright_years_remaining || config.copyright_years_remaining;
    const copyrightDiscount = yearsRemaining < 20 ? Math.max(0.5, yearsRemaining / 20) : 1.0;
    value *= copyrightDiscount;

    return {
      song_id: song.id || song.title, title: song.title, artist: song.artist,
      annual_revenue: Math.round(annualRevenue * 100) / 100,
      decay_adjusted_revenue: Math.round(decayAdjustedRevenue * 100) / 100,
      value: Math.round(value * 100) / 100,
      ownership_percent: song.ownership_percent || 100,
      contributed_value: Math.round(value * (song.ownership_percent || 100) / 100 * 100) / 100,
      copyright_discount: Math.round(copyrightDiscount * 100) / 100,
      country: song.country || "US",
    };
  });

  const totalValue = songValuations.reduce((s: number, v: any) => s + v.contributed_value, 0);
  const totalAnnualRevenue = songValuations.reduce((s: number, v: any) => s + v.annual_revenue, 0);
  const mcResult = runMonteCarlo(totalAnnualRevenue, config);

  // --- Risk Metrics ---
  const sortedByValue = [...songValuations].sort((a: any, b: any) => b.contributed_value - a.contributed_value);
  const top3Value = sortedByValue.slice(0, 3).reduce((s: number, v: any) => s + v.contributed_value, 0);
  const concentrationRisk = totalValue > 0 ? top3Value / totalValue : 0;

  // Herfindahl index for concentration
  const herfindahl = totalValue > 0
    ? songValuations.reduce((sum: number, v: any) => sum + Math.pow(v.contributed_value / totalValue, 2), 0)
    : 0;

  // Genre diversification
  const genres = new Set(songs.map((s: any) => s.genre).filter(Boolean));

  // --- NEW: Geographic Diversification Score ---
  const countryCounts: Record<string, number> = {};
  songValuations.forEach((v: any) => {
    const c = v.country || "US";
    countryCounts[c] = (countryCounts[c] || 0) + v.contributed_value;
  });
  const countryShares = Object.values(countryCounts).map(v => totalValue > 0 ? v / totalValue : 0);
  const geoHerfindahl = countryShares.reduce((sum, s) => sum + s * s, 0);
  const geoDiversification = Math.round((1 - geoHerfindahl) * 100);

  // --- Decay factor ---
  const avgDecayRatio = songValuations.length > 0
    ? songValuations.reduce((sum: number, v: any) => sum + (v.decay_adjusted_revenue / Math.max(v.annual_revenue, 0.01)), 0) / songValuations.length
    : 1;
  const decayFactor = Math.round((1 - avgDecayRatio) * 100);

  // Copyright expiry impact
  const avgCopyrightDiscount = songValuations.length > 0
    ? songValuations.reduce((sum: number, v: any) => sum + (v.copyright_discount || 1), 0) / songValuations.length
    : 1;
  const copyrightExpiryImpact = Math.round((1 - avgCopyrightDiscount) * 100);

  const { data: valuation } = await supabase.from("catalog_valuations")
    .insert({
      user_id: userId, total_value: totalValue, methodology: method,
      assumptions: config, song_valuations: songValuations, confidence_interval: mcResult,
      decay_factor: decayFactor, concentration_risk: Math.round(herfindahl * 10000) / 100,
      geographic_score: geoDiversification, copyright_expiry_impact: copyrightExpiryImpact,
    })
    .select().single();

  return {
    valuation: valuation || { total_value: totalValue, methodology: method },
    song_valuations: songValuations, confidence_interval: mcResult,
    risk_metrics: {
      concentration_risk: Math.round(concentrationRisk * 100),
      herfindahl_index: Math.round(herfindahl * 10000) / 100,
      genre_diversification: Math.round(Math.min(genres.size / 5, 1) * 100),
      geographic_diversification: geoDiversification,
      top_3_percentage: Math.round(concentrationRisk * 100),
      decay_factor: decayFactor,
      copyright_expiry_impact: copyrightExpiryImpact,
    },
    market_comparables: (multiples || []).slice(0, 5),
    median_market_multiple: getMedianMultiple(multiples || []),
  };
}

// --- Revenue & Decay ---

function calculateSongAnnualRevenue(song: any, rates: any[]): number {
  const getRate = (platform: string, country = "US") => {
    const r = rates.find((r: any) => r.platform === platform && r.country_code === country);
    return r ? parseFloat(r.rate_per_stream) : (platform === "spotify" ? 0.00437 : 0.00182);
  };
  const own = (song.ownership_percent || 100) / 100;
  const sRev = (song.spotify_streams || 0) * getRate("spotify", song.country || "US") * 12;
  const yRev = (song.youtube_views || 0) * getRate("youtube", song.country || "US") * 12;
  return (sRev + yRev + (sRev + yRev) * 0.15) * own;
}

function applyDecayModel(annualRevenue: number, decayRate: number, releaseYear?: number): number {
  if (!releaseYear) return annualRevenue;
  const age = new Date().getFullYear() - releaseYear;
  if (age <= 1) return annualRevenue; // New releases don't decay yet
  // Exponential decay: revenue * e^(-decay_rate * age), floored at 30% of original
  const decayFactor = Math.max(0.30, Math.exp(-decayRate * Math.max(age - 1, 0)));
  return annualRevenue * decayFactor;
}

// --- Financial Models ---

function calculateDCF(annualRevenue: number, c: any): number {
  let pv = 0, last = annualRevenue;
  for (let y = 1; y <= 5; y++) { const p = annualRevenue * Math.pow(1 + c.growth_rate, y); pv += p / Math.pow(1 + c.discount_rate, y); last = p; }
  return pv + last * (1 + c.terminal_growth_rate) / (c.discount_rate - c.terminal_growth_rate) / Math.pow(1 + c.discount_rate, 5);
}

function getMedianMultiple(multiples: any[], genre?: string): number {
  let f = multiples;
  if (genre) { const gf = multiples.filter((m: any) => m.genre === genre); if (gf.length >= 3) f = gf; }
  if (f.length === 0) return 18;
  const s = f.map((m: any) => m.multiple).sort((a: number, b: number) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function runMonteCarlo(annualRevenue: number, c: any) {
  const n = Math.min(c.simulations || 10000, 10000);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let rev = annualRevenue;
    const g = rn(c.growth_rate, 0.05), m = rn(c.multiple, 3), ch = rn(0.05, 0.02);
    for (let y = 1; y <= 5; y++) rev *= (1 + g - Math.max(ch, 0));
    out.push(rev * Math.max(m, 5));
  }
  out.sort((a, b) => a - b);
  const p = (pct: number) => Math.round(out[Math.floor(n * pct)] * 100) / 100;
  return { low: p(0.1), mid: p(0.5), high: p(0.9), mean: Math.round(out.reduce((a, b) => a + b, 0) / n * 100) / 100, p5: p(0.05), p95: p(0.95) };
}

function rn(mean: number, std: number): number {
  return mean + Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()) * std;
}
