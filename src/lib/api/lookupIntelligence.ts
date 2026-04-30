import { supabase } from "@/integrations/supabase/client";

export type ConfidenceBucket = "exact" | "strong" | "probable" | "ambiguous" | "low";

export interface LookupSourceStatus {
  name: string;
  status: "success" | "partial" | "failed" | "no_data";
  recordsFetched: number;
}

export interface LookupScoreBreakdown {
  titleSim: number;
  artistSim: number;
  identifierBoost: number;
  agreementBoost: number;
  freshnessBoost: number;
  registryBoost: number;
  variantPenalty: number;
  inputBoost: number;
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
    producers?: string[];
  };
}

export interface LookupCandidate extends LookupBestMatch {
  score: number;
  bucket: ConfidenceBucket;
  reasons: string[];
  breakdown?: LookupScoreBreakdown;
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
  ambiguous?: boolean;
  breakdown?: LookupScoreBreakdown;
  override?: { pinned: boolean; reason?: string; by_user?: string; is_global?: boolean };
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

export interface LookupSnapshot {
  id: string;
  captured_at: string;
  spotify_popularity: number | null;
  spotify_stream_count: number | null;
  youtube_view_count: number | null;
  genius_pageviews: number | null;
  shazam_count: number | null;
  source_coverage: number;
  confidence_score: number;
}

export async function fetchLookupSnapshots(trackKey: string, limit = 20): Promise<LookupSnapshot[]> {
  try {
    const { data, error } = await supabase
      .from("lookup_snapshots")
      .select("id, captured_at, spotify_popularity, spotify_stream_count, youtube_view_count, genius_pageviews, shazam_count, source_coverage, confidence_score")
      .eq("track_key", trackKey)
      .order("captured_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []) as LookupSnapshot[];
  } catch { return []; }
}

export interface LookupAuditEntry {
  id: string;
  query_raw: string;
  confidence_score: number;
  confidence_bucket: string;
  duration_ms: number | null;
  created_at: string;
}

export async function fetchRecentLookups(limit = 25): Promise<LookupAuditEntry[]> {
  try {
    const { data, error } = await supabase
      .from("lookup_audit")
      .select("id, query_raw, confidence_score, confidence_bucket, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []) as LookupAuditEntry[];
  } catch { return []; }
}

function normForOverride(q: string) {
  return (q || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export async function pinManualOverride(query: string, payload: LookupIntelligenceResult, reason?: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from("manual_match_overrides").insert([{
      user_id: user.id,
      query_normalized: normForOverride(query),
      pinned_track_id: payload.best_match?.track_id ?? null,
      pinned_payload: payload as any,
      reason: reason || null,
      is_global: false,
    }]);
    return !error;
  } catch { return false; }
}

export async function clearManualOverride(query: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from("manual_match_overrides")
      .delete().eq("user_id", user.id).eq("query_normalized", normForOverride(query));
    return !error;
  } catch { return false; }
}