import { supabase } from "@/integrations/supabase/client";

export type ConfidenceBucket = "exact" | "strong" | "probable" | "ambiguous" | "low";

export interface LookupSourceStatus {
  name: string;
  status: "success" | "partial" | "failed" | "no_data";
  recordsFetched: number;
}

export interface LookupBestMatch {
  track_id: string | null;
  title: string;
  artist: string;
  isrc?: string | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
  musicbrainzRecordingId?: string | null;
  platforms: {
    spotify: { url: string | null; popularity: number | null };
    youtube: { url: string | null; views: string | null };
    genius: { url: string | null; pageviews: number | null; id: number | null };
    shazam: { count: number | null; url: string | null };
  };
  publishing: {
    collectingPublishers: Array<{ name: string; share?: number; source?: string; role?: string }>;
    shares: Array<{ name: string; share?: number; source?: string }>;
    detectedOrgs: string[];
    writers: string[];
  };
}

export interface LookupCandidate extends LookupBestMatch {
  score: number;
  bucket: ConfidenceBucket;
  reasons: string[];
  source: string;
  primary?: boolean;
}

export interface LookupIntelligenceResult {
  query_raw: string;
  input_type: "url" | "isrc" | "text";
  best_match: LookupBestMatch | null;
  candidates: LookupCandidate[];
  source_statuses: LookupSourceStatus[];
  confidence_score: number;
  confidence_bucket: ConfidenceBucket;
  why_won: string[];
  agreement?: number;
  duration_ms?: number;
  last_verified_at?: string;
}

export async function runLookupIntelligence(query: string): Promise<LookupIntelligenceResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("lookup-intelligence", {
      body: { query },
    });
    if (error) {
      console.error("lookup-intelligence error", error);
      return null;
    }
    if (!data?.success) return null;
    return data.data as LookupIntelligenceResult;
  } catch (e) {
    console.error("lookup-intelligence exception", e);
    return null;
  }
}