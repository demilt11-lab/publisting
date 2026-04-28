import { supabase } from "@/integrations/supabase/client";

export interface DspNormalizationInput {
  spotify_track_id?: string;
  isrc?: string;
  url?: string;
  title?: string;
  artist?: string;
}

export interface DspCanonicalRecord {
  spotify_track_id: string;
  isrc: string | null;
  canonical_title: string | null;
  canonical_artist: string | null;
  apple_track_id: string | null;
  apple_url: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  deezer_track_id: string | null;
  deezer_url: string | null;
  tidal_track_id: string | null;
  tidal_url: string | null;
  amazon_url: string | null;
  soundcloud_url: string | null;
  pandora_url: string | null;
  page_url: string | null;
  fetched_at?: string;
  expires_at?: string;
}

export interface DspNormalizationResult {
  success: boolean;
  results: { key: string; cached: boolean; data: DspCanonicalRecord | null; error?: string }[];
  error?: string;
}

export async function normalizeDspIds(
  items: DspNormalizationInput[],
  opts: { force?: boolean } = {},
): Promise<DspNormalizationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("dsp-id-normalize", {
      body: { items, force: !!opts.force },
    });
    if (error) return { success: false, results: [], error: error.message || "Failed" };
    return data as DspNormalizationResult;
  } catch (e) {
    return { success: false, results: [], error: e instanceof Error ? e.message : "Failed" };
  }
}