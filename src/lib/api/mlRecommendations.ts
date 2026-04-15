import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Enrich a song candidate with audio features + unsigned talent ──
export async function enrichSongCandidate(params: {
  title: string;
  artist: string;
  spotifyUrl?: string;
  appleUrl?: string;
}): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ml-enrich-candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

// ── Get ML-powered recommendations ──────────────────────────────
export interface MLRecommendation {
  id: string;
  songKey: string;
  title: string;
  artist: string;
  spotifyUrl?: string;
  score: number;
  scores: {
    collaborative: number;
    content: number;
    watchlist: number;
    unsigned: number;
    diversity: number;
  };
  reason: {
    genre_match: number;
    matched_genres: string[];
    region_match: number;
    audio_similarity: number;
    collaborative_match: number;
    watchlist_alignment: number;
    unsigned_count: number;
    popularity: number;
  };
  unsignedTalent: Array<{ name: string; role: string; confidence: number }>;
  audioFeatures: {
    tempo?: number;
    energy?: number;
    danceability?: number;
    valence?: number;
    acousticness?: number;
  };
  genre: string[];
  region?: string;
  popularity?: number;
}

export interface MLRecommendationResult {
  data: MLRecommendation[];
  cached: boolean;
  fallback?: "ai";
  profileSummary?: {
    topGenres: string[];
    topRegions: string[];
    watchlistCount: number;
  };
}

export async function getMLRecommendations(params: {
  userId: string;
  limit?: number;
  excludeSongIds?: string[];
  forceRefresh?: boolean;
}): Promise<MLRecommendationResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ml-recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.error("ML recommendations error:", res.status);
      return { data: [], cached: false };
    }
    const result = await res.json();
    return {
      data: result.data || [],
      cached: result.cached || false,
      fallback: result.fallback,
      profileSummary: result.profileSummary,
    };
  } catch {
    return { data: [], cached: false };
  }
}

// ── Record feedback on a recommendation ─────────────────────────
export async function recordMLFeedback(params: {
  userId: string;
  recommendationId?: string;
  songKey: string;
  title: string;
  artist: string;
  feedbackType: "liked" | "dismissed" | "searched" | "watchlist_added";
  genre?: string;
  talentRole?: string;
  unsignedTalent?: string;
}): Promise<void> {
  try {
    await supabase.from("ml_feedback").insert({
      user_id: params.userId,
      recommendation_id: params.recommendationId || null,
      song_key: params.songKey,
      title: params.title,
      artist: params.artist,
      feedback_type: params.feedbackType,
      genre: params.genre || null,
      talent_role: params.talentRole || null,
      unsigned_talent: params.unsignedTalent || null,
    });
  } catch (e) {
    console.error("Failed to record ML feedback:", e);
  }
}

// ── Enrich in background during song lookups ────────────────────
export function enrichInBackground(title: string, artist: string, spotifyUrl?: string, appleUrl?: string) {
  // Fire and forget
  enrichSongCandidate({ title, artist, spotifyUrl, appleUrl }).catch(() => {});
}
