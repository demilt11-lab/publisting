import { supabase } from "@/integrations/supabase/client";

export interface NormalizationInput {
  title?: string;
  artist?: string;
  isrc?: string;
  iswc?: string;
  spotify_track_id?: string;
}

export interface NormalizedRecord {
  cache_key: string;
  canonical_title: string | null;
  canonical_artist: string | null;
  isrc: string | null;
  iswc: string | null;
  spotify_track_id: string | null;
  mbid_recording: string | null;
  mbid_work: string | null;
  writer_ipis: { name: string; ipi: string | null; role: string }[];
  publisher_ipis: { name: string; ipi: string | null; role: string }[];
  sources: string[];
  confidence: number;
  fetched_at: string;
  expires_at: string;
}

export async function normalizeMetadata(
  items: NormalizationInput[],
  opts: { force?: boolean } = {},
): Promise<{ success: boolean; results: { key: string; cached: boolean; data: NormalizedRecord }[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("metadata-normalize", {
      body: { items, force: !!opts.force },
    });
    if (error) return { success: false, results: [], error: error.message || "Failed" };
    return data as any;
  } catch (e) {
    return { success: false, results: [], error: e instanceof Error ? e.message : "Failed" };
  }
}