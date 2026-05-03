import { supabase } from "@/integrations/supabase/client";

export interface QualityRecord {
  entity_id: string;
  entity_type: string;
  completeness_score: number;
  confidence_score: number;
  validation_flags: string[];
  missing_fields: string[];
  warnings: string[];
  source_breakdown: Record<string, any>;
  last_validated_at: string;
}

export interface DuplicatePair {
  id: string;
  entity_type: string;
  entity_id_1: string;
  entity_id_2: string;
  similarity_score: number;
  match_reason: string | null;
  merge_status: "pending" | "merged" | "ignored" | "auto_merged";
  merged_into: string | null;
}

export interface DataQualityDashboard {
  ok: boolean;
  overall_completeness: number;
  total_records: number;
  low_quality_records: number;
  flagged_records: number;
  pending_duplicates: number;
  auto_merged_duplicates: number;
  caches: {
    spotify: { total: number; fresh: number; hit_rate: number };
    soundcharts: { total: number; fresh: number; hit_rate: number };
    genius: { total: number; fresh: number; hit_rate: number };
  };
}

export async function fetchEntityQuality(entityType: string, entityId: string): Promise<QualityRecord | null> {
  const { data } = await supabase.from("search_result_quality")
    .select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  return (data as any) ?? null;
}

export async function fetchEntityDuplicates(entityType: string, entityId: string): Promise<DuplicatePair[]> {
  const { data } = await supabase.from("potential_duplicates")
    .select("*")
    .eq("entity_type", entityType)
    .or(`entity_id_1.eq.${entityId},entity_id_2.eq.${entityId}`)
    .in("merge_status", ["pending", "auto_merged"]);
  return (data as any) ?? [];
}

export async function fetchDataQualityDashboard(): Promise<DataQualityDashboard> {
  const { data, error } = await supabase.functions.invoke("data-quality-dashboard", { body: {} });
  if (error) throw error;
  return data as DataQualityDashboard;
}

export async function forceRevalidateAllCaches(): Promise<{ ok: boolean; invalidated: any }> {
  const { data, error } = await supabase.functions.invoke("data-quality-dashboard", { body: { action: "force_revalidate" } });
  if (error) throw error;
  return data as any;
}

export async function validateEntity(opts: {
  entity_type: "track" | "artist" | "creator" | "album";
  entity_id: string;
  data?: Record<string, any>;
  source?: string;
  sources?: Record<string, any>;
}) {
  const { data, error } = await supabase.functions.invoke("metadata-validate", { body: opts });
  if (error) throw error;
  return data;
}

export async function runDedupScan(entityType: "track" | "artist" | "creator", autoMerge = true) {
  const { data, error } = await supabase.functions.invoke("dedup-scan", {
    body: { entity_type: entityType, auto_merge: autoMerge },
  });
  if (error) throw error;
  return data;
}

/**
 * Combine raw search-match score with completeness, recency, and source consensus.
 * Returns 0..100 percentage.
 */
export function relevanceScore(
  textMatchScore: number,                 // 0..1 from search ranker
  quality?: QualityRecord | null,
  lastUpdatedAt?: string | null,
): number {
  const base = Math.round(Math.max(0, Math.min(1, textMatchScore)) * 100);
  let completenessBonus = 0;
  let recencyBonus = 0;
  let consensusBonus = 0;
  if (quality) {
    if (quality.completeness_score >= 80) completenessBonus = 20;
    else if (quality.completeness_score >= 60) completenessBonus = 10;
    if (quality.confidence_score >= 80) consensusBonus = 15;
    else if (quality.confidence_score >= 60) consensusBonus = 8;
  }
  const ts = lastUpdatedAt ?? quality?.last_validated_at;
  if (ts) {
    const ageDays = (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) recencyBonus = 10;
    else if (ageDays <= 30) recencyBonus = 5;
  }
  return Math.min(100, base + completenessBonus + recencyBonus + consensusBonus);
}