import { supabase } from "@/integrations/supabase/client";
import type { OutreachEntityType } from "./outreachCrm";

export type FeedbackKind = "recommendation_accept" | "recommendation_reject" | "score_override" | "outreach_outcome" | "prediction_correction";

export interface ModelFeedback {
  id: string;
  team_id: string | null;
  user_id: string;
  kind: FeedbackKind;
  entity_type: OutreachEntityType | null;
  entity_key: string | null;
  model_name: string | null;
  signal: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ModelWeightOverlay {
  id: string;
  team_id: string | null;
  model_name: string;
  weights: Record<string, number>;
  sample_size: number;
  computed_at: string;
}

export async function recordFeedback(input: {
  team_id?: string | null;
  kind: FeedbackKind;
  entity_type?: OutreachEntityType | null;
  entity_key?: string | null;
  model_name?: string | null;
  signal?: number | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("model_feedback").insert({ ...input, user_id: u.user.id, payload: input.payload ?? {} } as never);
}

export async function listFeedback(teamId: string, limit = 200): Promise<ModelFeedback[]> {
  const { data, error } = await supabase
    .from("model_feedback")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ModelFeedback[];
}

export async function getOverlay(teamId: string | null, modelName: string): Promise<ModelWeightOverlay | null> {
  let q = supabase.from("model_weight_overlays").select("*").eq("model_name", modelName);
  q = teamId ? q.eq("team_id", teamId) : q.is("team_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data as ModelWeightOverlay | null;
}

export async function recomputeOverlays(teamId: string): Promise<{ updated: number }> {
  const { data, error } = await supabase.functions.invoke("learning-loop", { body: { team_id: teamId } });
  if (error) throw error;
  return data as { updated: number };
}