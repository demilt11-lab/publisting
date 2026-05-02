import { supabase } from "@/integrations/supabase/client";

export interface SavedFilterSet {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  scope: string;
  filters: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export async function listSavedFilters(scope = "discovery", teamId?: string | null): Promise<SavedFilterSet[]> {
  let q = supabase.from("saved_filter_sets").select("*").eq("scope", scope).order("updated_at", { ascending: false });
  if (teamId) q = q.or(`team_id.eq.${teamId},team_id.is.null`);
  const { data } = await q;
  return (data ?? []) as SavedFilterSet[];
}

export async function saveFilter(input: {
  name: string;
  filters: Record<string, any>;
  scope?: string;
  team_id?: string | null;
}): Promise<SavedFilterSet | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("saved_filter_sets")
    .insert({
      user_id: user.id, name: input.name, filters: input.filters,
      scope: input.scope ?? "discovery", team_id: input.team_id ?? null,
    } as any).select("*").single();
  if (error) { console.warn("saveFilter", error); return null; }
  return data as any;
}

export async function deleteFilter(id: string): Promise<boolean> {
  const { error } = await supabase.from("saved_filter_sets").delete().eq("id", id);
  return !error;
}