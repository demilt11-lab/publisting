import { supabase } from "@/integrations/supabase/client";
import type { OutreachEntityType } from "./outreachCrm";

export interface SharedWatchlist {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SharedWatchlistItem {
  id: string;
  watchlist_id: string;
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  entity_meta: Record<string, unknown>;
  added_by: string;
  created_at: string;
}

export interface CollabComment {
  id: string;
  team_id: string;
  target_type: string;
  target_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
}

export interface DecisionLog {
  id: string;
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  decision: string;
  rationale: string | null;
  decided_by: string;
  decided_at: string;
  meta: Record<string, unknown>;
}

export async function listWatchlists(teamId: string): Promise<SharedWatchlist[]> {
  const { data, error } = await supabase.from("shared_watchlists").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SharedWatchlist[];
}

export async function createWatchlist(teamId: string, name: string, description?: string): Promise<SharedWatchlist> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("shared_watchlists").insert({ team_id: teamId, name, description, created_by: u.user.id } as never).select().single();
  if (error) throw error;
  return data as SharedWatchlist;
}

export async function deleteWatchlist(id: string): Promise<void> {
  const { error } = await supabase.from("shared_watchlists").delete().eq("id", id);
  if (error) throw error;
}

export async function listWatchlistItems(watchlistId: string): Promise<SharedWatchlistItem[]> {
  const { data, error } = await supabase.from("shared_watchlist_items").select("*").eq("watchlist_id", watchlistId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SharedWatchlistItem[];
}

export async function addWatchlistItem(input: Omit<SharedWatchlistItem, "id" | "added_by" | "created_at" | "entity_meta"> & { entity_meta?: Record<string, unknown> }): Promise<SharedWatchlistItem> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("shared_watchlist_items").insert({ ...input, added_by: u.user.id } as never).select().single();
  if (error) throw error;
  return data as SharedWatchlistItem;
}

export async function removeWatchlistItem(id: string): Promise<void> {
  const { error } = await supabase.from("shared_watchlist_items").delete().eq("id", id);
  if (error) throw error;
}

export async function listComments(teamId: string, targetType: string, targetId: string): Promise<CollabComment[]> {
  const { data, error } = await supabase
    .from("collab_comments")
    .select("*")
    .eq("team_id", teamId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as CollabComment[];
}

export async function addComment(teamId: string, targetType: string, targetId: string, body: string, mentions: string[] = []): Promise<CollabComment> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("collab_comments").insert({ team_id: teamId, target_type: targetType, target_id: targetId, body, mentions, author_id: u.user.id } as never).select().single();
  if (error) throw error;
  return data as CollabComment;
}

export async function listDecisions(teamId: string, opts?: { entityType?: OutreachEntityType; entityKey?: string }): Promise<DecisionLog[]> {
  let q = supabase.from("decision_logs").select("*").eq("team_id", teamId);
  if (opts?.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts?.entityKey) q = q.eq("entity_key", opts.entityKey);
  const { data, error } = await q.order("decided_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DecisionLog[];
}

export async function logDecision(input: Omit<DecisionLog, "id" | "decided_at" | "decided_by" | "meta"> & { meta?: Record<string, unknown> }): Promise<DecisionLog> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("decision_logs").insert({ ...input, decided_by: u.user.id } as never).select().single();
  if (error) throw error;
  return data as DecisionLog;
}