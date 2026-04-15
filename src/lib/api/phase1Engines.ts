import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// --- Trend Forecasting ---
export async function fetchTrendForecast(personId: string, personName: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/trend-forecasting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ person_id: personId, person_name: personName }),
  });
  if (!res.ok) throw new Error("Trend forecast failed");
  return res.json();
}

export async function getTrendingMetrics(personId: string) {
  const { data } = await supabase
    .from("artist_trending_metrics")
    .select("*")
    .eq("person_id", personId)
    .order("date", { ascending: false })
    .limit(30);
  return data || [];
}

export async function getTrendPredictions(personId: string) {
  const { data } = await supabase
    .from("trend_predictions")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}

// --- Deal Scoring ---
export async function fetchDealScore(entryId: string, teamId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/deal-scoring`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ entry_id: entryId, team_id: teamId }),
  });
  if (!res.ok) throw new Error("Deal scoring failed");
  return res.json();
}

export async function getLatestDealScore(entryId: string) {
  const { data } = await supabase
    .from("deal_likelihood_scores")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function logPipelineActivity(
  entryId: string,
  teamId: string,
  activityType: string,
  details: Record<string, any>,
  createdBy: string
) {
  const { data, error } = await supabase
    .from("pipeline_activities")
    .insert({ entry_id: entryId, team_id: teamId, activity_type: activityType, details, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPipelineActivities(entryId: string) {
  const { data } = await supabase
    .from("pipeline_activities")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

// --- Catalog Valuation ---
export async function runCatalogValuation(
  userId: string,
  songs: any[],
  methodology: string = "income_approach",
  assumptions: Record<string, number> = {}
) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/catalog-valuation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ user_id: userId, songs, methodology, assumptions }),
  });
  if (!res.ok) throw new Error("Catalog valuation failed");
  return res.json();
}

export async function getLatestValuation(userId: string) {
  const { data } = await supabase
    .from("catalog_valuations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getMarketMultiples(genre?: string) {
  let query = supabase
    .from("market_multiples")
    .select("*")
    .eq("verified", true)
    .order("transaction_date", { ascending: false });

  if (genre) query = query.eq("genre", genre);
  const { data } = await query.limit(20);
  return data || [];
}

export async function getValuationHistory(userId: string) {
  const { data } = await supabase
    .from("catalog_valuations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}
