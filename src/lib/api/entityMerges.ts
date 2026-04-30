import { supabase } from "@/integrations/supabase/client";

export type EntityType = "track" | "artist" | "contributor" | "work";

export interface MergeProposal {
  id: string;
  entity_type: EntityType;
  source_id: string;
  target_id: string;
  source_name: string | null;
  target_name: string | null;
  reason: string | null;
  evidence: any;
  status: "pending" | "approved" | "rejected";
  proposed_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export async function fetchProposals(status: string, limit = 100): Promise<MergeProposal[]> {
  const q = supabase
    .from("entity_merge_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data } = status === "all" ? await q : await q.eq("status", status as any);
  return (data || []) as MergeProposal[];
}

export async function createProposal(input: {
  entity_type: EntityType;
  source_id: string;
  target_id: string;
  source_name?: string;
  target_name?: string;
  reason?: string;
  evidence?: any;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("entity_merge_proposals")
    .insert({
      ...input,
      evidence: input.evidence ?? {},
      proposed_by: user?.id ?? null,
      status: "pending",
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function decideProposal(id: string, decision: "approved" | "rejected") {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("entity_merge_proposals")
    .update({
      status: decision,
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
    } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function bulkDecide(ids: string[], decision: "approved" | "rejected") {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("entity_merge_proposals")
    .update({
      status: decision,
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
    } as any)
    .in("id", ids);
  if (error) throw error;
}

export async function lookupEntityName(entity_type: EntityType, id: string): Promise<string | null> {
  const map: Record<EntityType, { table: string; col: string }> = {
    track: { table: "canonical_tracks", col: "title" },
    artist: { table: "canonical_artists", col: "display_name" },
    contributor: { table: "contributors", col: "display_name" },
    work: { table: "canonical_works", col: "title" },
  };
  const m = map[entity_type];
  const { data } = await supabase.from(m.table as any).select(`${m.col}`).eq("id", id).maybeSingle();
  return (data as any)?.[m.col] ?? null;
}