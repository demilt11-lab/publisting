import { supabase } from "@/integrations/supabase/client";
import type { EntityType } from "./entityResolver";

export interface ChartHistoryPoint {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  platform: string;
  chart_type: string;
  country: string | null;
  rank: number;
  date: string;
  source: string | null;
  metadata: Record<string, unknown>;
}

export interface PlaylistHistoryPoint {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  platform: string;
  playlist_id: string;
  playlist_name: string | null;
  position: number | null;
  followers: number | null;
  date: string;
  source: string | null;
  metadata: Record<string, unknown>;
}

export async function fetchChartHistory(
  entityType: EntityType, entityId: string, days = 90,
): Promise<ChartHistoryPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("chart_history")
    .select("*").eq("entity_type", entityType).eq("entity_id", entityId)
    .gte("date", since).order("date", { ascending: true });
  if (error) return [];
  return (data ?? []) as ChartHistoryPoint[];
}

export async function fetchPlaylistHistory(
  entityType: EntityType, entityId: string, days = 90,
): Promise<PlaylistHistoryPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("playlist_history")
    .select("*").eq("entity_type", entityType).eq("entity_id", entityId)
    .gte("date", since).order("date", { ascending: true });
  if (error) return [];
  return (data ?? []) as PlaylistHistoryPoint[];
}

export async function fetchFieldProvenance(entityType: EntityType, entityId: string) {
  const { data, error } = await supabase.from("field_provenance")
    .select("field_name, field_value, source, confidence, observed_at")
    .eq("entity_type", entityType).eq("entity_id", entityId)
    .order("observed_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}
