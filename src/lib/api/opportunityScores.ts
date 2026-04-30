import { supabase } from "@/integrations/supabase/client";

export type EntityType = "track" | "artist" | "writer" | "producer";
export type LifecycleState = "emerging" | "accelerating" | "peaking" | "stable" | "declining" | "dormant";

export interface OpportunityScore {
  id: string;
  entity_type: EntityType;
  entity_key: string;
  display_name: string;
  primary_artist: string | null;
  score: number;
  momentum_component: number;
  chart_component: number;
  alert_velocity_component: number;
  network_component: number;
  signing_gap_component: number;
  lifecycle_state: LifecycleState;
  state_confidence: number;
  signals: any;
  explanation: string | null;
  data_points: number;
  computed_at: string;
}

export async function fetchOpportunityScores(opts: {
  entity_types?: EntityType[];
  lifecycle?: LifecycleState[];
  min_score?: number;
  search?: string;
  limit?: number;
}): Promise<OpportunityScore[]> {
  let q = supabase.from("opportunity_scores")
    .select("*").order("score", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.entity_types?.length) q = q.in("entity_type", opts.entity_types as any);
  if (opts.lifecycle?.length) q = q.in("lifecycle_state", opts.lifecycle as any);
  if (typeof opts.min_score === "number") q = q.gte("score", opts.min_score);
  if (opts.search) q = q.ilike("display_name", `%${opts.search}%`);
  const { data } = await q;
  return (data || []) as OpportunityScore[];
}

export async function fetchScoreFor(entity_type: EntityType, entity_key: string): Promise<OpportunityScore | null> {
  const { data } = await supabase.from("opportunity_scores")
    .select("*").eq("entity_type", entity_type).eq("entity_key", entity_key).maybeSingle();
  return (data as any) ?? null;
}

export async function recomputeOpportunity(entity_type: EntityType, entity_key: string, track_key?: string) {
  const { data, error } = await supabase.functions.invoke("opportunity-engine", {
    body: { entity_type, entity_key, track_key },
  });
  if (error) throw error;
  return data;
}

export async function recomputeAllOpportunities() {
  const { data, error } = await supabase.functions.invoke("opportunity-engine", { body: {} });
  if (error) throw error;
  return data;
}

// Smart recommendations
export interface SmartRecommendation {
  entity_type: EntityType;
  entity_key: string;
  name: string;
  primary_artist?: string | null;
  base_score: number;
  score: number;
  lifecycle_state: LifecycleState;
  state_confidence: number;
  reasons: string[];
}
export async function fetchSmartRecommendations(opts: {
  user_id?: string;
  team_id?: string;
  entity_types?: EntityType[];
  limit?: number;
}): Promise<SmartRecommendation[]> {
  const { data } = await supabase.functions.invoke("smart-recommendations", { body: opts });
  return (data?.recommendations || []) as SmartRecommendation[];
}