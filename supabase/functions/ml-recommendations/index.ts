import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Vector math utilities ───────────────────────────────────────
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const va = a[k] || 0, vb = b[k] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function audioFeatureDistance(
  userPrefs: Record<string, number>,
  song: { tempo?: number; energy?: number; danceability?: number; valence?: number; acousticness?: number }
): number {
  const features = ["energy", "danceability", "valence", "acousticness"];
  let sumSq = 0, count = 0;
  for (const f of features) {
    const pref = userPrefs[f];
    const val = (song as any)[f];
    if (pref != null && val != null) {
      sumSq += (pref - val) ** 2;
      count++;
    }
  }
  if (count === 0) return 0.5;
  return 1 - Math.sqrt(sumSq / count); // 1 = perfect match, 0 = opposite
}

// ── TF-IDF genre vector ─────────────────────────────────────────
function buildGenreVector(genres: string[], idfWeights: Record<string, number>): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const g of genres) {
    tf[g] = (tf[g] || 0) + 1;
  }
  const total = genres.length || 1;
  const vec: Record<string, number> = {};
  for (const [g, count] of Object.entries(tf)) {
    vec[g] = (count / total) * (idfWeights[g] || 1);
  }
  return vec;
}

// ── Temporal decay ──────────────────────────────────────────────
function temporalWeight(dateStr: string, halfLifeDays = 30): number {
  const age = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-0.693 * age / halfLifeDays); // exponential decay
}

// ── Build user profile from search history & watchlist ──────────
async function buildUserProfile(userId: string, supabase: ReturnType<typeof getSupabase>) {
  // Get user's searched songs from ml_song_candidates (via feedback/recommendations)
  const { data: feedback } = await supabase
    .from("ml_feedback")
    .select("song_key, feedback_type, genre, talent_role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  // Get existing enriched candidates the user has interacted with
  const songKeys = [...new Set((feedback || []).map(f => f.song_key))];
  let searchedCandidates: any[] = [];
  if (songKeys.length > 0) {
    const { data } = await supabase
      .from("ml_song_candidates")
      .select("*")
      .in("song_key", songKeys.slice(0, 100));
    searchedCandidates = data || [];
  }

  // Get watchlist entries for boost signals
  const { data: watchlistEntries } = await supabase
    .from("watchlist_entries")
    .select("person_name, person_type, pipeline_status, is_priority, pro")
    .limit(100);

  // Build genre distribution
  const genreCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  const audioSums: Record<string, { sum: number; count: number }> = {};
  let popSum = 0, popCount = 0;

  for (const c of searchedCandidates) {
    const weight = 1; // Could weight by feedback type
    for (const g of (c.genre || [])) {
      genreCounts[g] = (genreCounts[g] || 0) + weight;
    }
    if (c.region) regionCounts[c.region] = (regionCounts[c.region] || 0) + weight;
    for (const feat of ["energy", "danceability", "valence", "acousticness", "tempo"]) {
      if (c[feat] != null) {
        if (!audioSums[feat]) audioSums[feat] = { sum: 0, count: 0 };
        audioSums[feat].sum += c[feat];
        audioSums[feat].count++;
      }
    }
    if (c.popularity != null) { popSum += c.popularity; popCount++; }
  }

  // Normalize to weights
  const totalGenre = Object.values(genreCounts).reduce((a, b) => a + b, 0) || 1;
  const genreWeights: Record<string, number> = {};
  for (const [g, c] of Object.entries(genreCounts)) genreWeights[g] = c / totalGenre;

  const totalRegion = Object.values(regionCounts).reduce((a, b) => a + b, 0) || 1;
  const regionWeights: Record<string, number> = {};
  for (const [r, c] of Object.entries(regionCounts)) regionWeights[r] = c / totalRegion;

  const audioPrefs: Record<string, number> = {};
  for (const [f, { sum, count }] of Object.entries(audioSums)) audioPrefs[f] = sum / count;

  return {
    genreWeights,
    regionWeights,
    audioPrefs,
    popularityMin: popCount > 0 ? Math.max(0, Math.round(popSum / popCount) - 30) : 0,
    popularityMax: popCount > 0 ? Math.min(100, Math.round(popSum / popCount) + 30) : 100,
    watchlistEntries: watchlistEntries || [],
    totalSearches: searchedCandidates.length,
    feedbackHistory: feedback || [],
  };
}

// ── Collaborative filtering ─────────────────────────────────────
async function getCollaborativeRecommendations(
  userId: string, userProfile: any, supabase: ReturnType<typeof getSupabase>
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  // Find other users' feedback to find similar tastes
  const { data: allFeedback } = await supabase
    .from("ml_feedback")
    .select("user_id, song_key, feedback_type, genre")
    .neq("user_id", userId)
    .eq("feedback_type", "liked")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!allFeedback || allFeedback.length === 0) return scores;

  // Build other users' genre profiles
  const userProfiles: Record<string, Record<string, number>> = {};
  const userSongs: Record<string, Set<string>> = {};
  for (const f of allFeedback) {
    if (!userProfiles[f.user_id]) { userProfiles[f.user_id] = {}; userSongs[f.user_id] = new Set(); }
    if (f.genre) userProfiles[f.user_id][f.genre] = (userProfiles[f.user_id][f.genre] || 0) + 1;
    userSongs[f.user_id].add(f.song_key);
  }

  // Find most similar users
  const userGenreVec = userProfile.genreWeights;
  const similarities: Array<{ userId: string; sim: number }> = [];
  for (const [uid, profile] of Object.entries(userProfiles)) {
    const total = Object.values(profile).reduce((a: number, b: any) => a + b, 0) || 1;
    const normalized: Record<string, number> = {};
    for (const [g, c] of Object.entries(profile)) normalized[g] = (c as number) / total;
    const sim = cosineSimilarity(userGenreVec, normalized);
    if (sim > 0.3) similarities.push({ userId: uid, sim });
  }

  similarities.sort((a, b) => b.sim - a.sim);
  const topSimilar = similarities.slice(0, 10);

  // Get songs from similar users that current user hasn't seen
  const userSongKeys = new Set(userProfile.feedbackHistory.map((f: any) => f.song_key));
  for (const { userId: simUserId, sim } of topSimilar) {
    for (const songKey of userSongs[simUserId] || []) {
      if (!userSongKeys.has(songKey)) {
        scores.set(songKey, (scores.get(songKey) || 0) + sim);
      }
    }
  }

  // Normalize to 0-1
  const maxScore = Math.max(...scores.values(), 1);
  for (const [k, v] of scores) scores.set(k, v / maxScore);

  return scores;
}

// ── Watchlist boost ─────────────────────────────────────────────
function getWatchlistBoost(
  candidate: any,
  watchlistEntries: any[]
): number {
  if (!watchlistEntries.length) return 0;

  let boost = 0;
  const candidateUnsigned = candidate.unsigned_talent || [];
  const candidateRegion = candidate.region?.toLowerCase();

  for (const entry of watchlistEntries) {
    const entryName = entry.person_name?.toLowerCase();
    // Direct name match with unsigned talent
    for (const u of candidateUnsigned) {
      if (u.name?.toLowerCase() === entryName) {
        const stageBoost: Record<string, number> = {
          not_contacted: 0.3, contacted: 0.5, negotiating: 0.8, signed: 0.1,
        };
        boost += stageBoost[entry.pipeline_status] || 0.3;
        if (entry.is_priority) boost += 0.2;
      }
    }
    // Same PRO region match
    if (entry.pro && candidateRegion) {
      const proRegions: Record<string, string[]> = {
        ASCAP: ["US"], BMI: ["US"], SESAC: ["US"],
        PRS: ["GB"], GEMA: ["DE"], SACEM: ["FR"],
        JASRAC: ["JP"], KOMCA: ["KR"], APRA: ["AU"],
      };
      const regions = proRegions[entry.pro] || [];
      if (regions.some(r => candidateRegion.includes(r.toLowerCase()))) boost += 0.1;
    }
  }

  return Math.min(boost, 1);
}

// ── Diversity score ─────────────────────────────────────────────
function diversityScore(
  candidate: any,
  userProfile: any,
  alreadyRecommended: string[]
): number {
  const candidateGenres = candidate.genre || [];
  const userGenres = Object.keys(userProfile.genreWeights);

  // Reward genres NOT in user's top preferences
  let novelGenreCount = 0;
  for (const g of candidateGenres) {
    if (!userGenres.includes(g) || (userProfile.genreWeights[g] || 0) < 0.1) {
      novelGenreCount++;
    }
  }
  const genreDiversity = candidateGenres.length > 0 ? novelGenreCount / candidateGenres.length : 0.5;

  // Penalize artists already recommended
  const artistKey = candidate.artist?.toLowerCase();
  const artistRepeat = alreadyRecommended.filter(k => k.includes(artistKey)).length;
  const repeatPenalty = Math.max(0, 1 - artistRepeat * 0.5);

  return genreDiversity * 0.6 + repeatPenalty * 0.4;
}

// ── Main scoring ────────────────────────────────────────────────
function scoreSong(
  candidate: any,
  userProfile: any,
  collabScore: number,
  alreadyRecommended: string[],
  idfWeights: Record<string, number>
): {
  score: number;
  collaborative_score: number;
  content_score: number;
  watchlist_score: number;
  unsigned_score: number;
  diversity_score: number;
  reason: Record<string, any>;
} {
  // Content similarity: genre + region + audio features
  const candidateGenreVec = buildGenreVector(candidate.genre || [], idfWeights);
  const userGenreVec = userProfile.genreWeights;
  const genreSim = cosineSimilarity(candidateGenreVec, userGenreVec);

  const regionSim = candidate.region && userProfile.regionWeights[candidate.region]
    ? userProfile.regionWeights[candidate.region] : 0;

  const audioSim = audioFeatureDistance(userProfile.audioPrefs, candidate);

  const contentScore = genreSim * 0.5 + regionSim * 0.2 + audioSim * 0.3;

  // Watchlist boost
  const watchlistScore = getWatchlistBoost(candidate, userProfile.watchlistEntries);

  // Unsigned talent score
  const unsignedCount = candidate.unsigned_count || 0;
  const unsignedScore = Math.min(unsignedCount * 0.3, 1);

  // Diversity
  const divScore = diversityScore(candidate, userProfile, alreadyRecommended);

  // Recency weight (prefer recently released/enriched)
  const recency = candidate.enriched_at ? temporalWeight(candidate.enriched_at, 60) : 0.5;

  // Popularity penalty: prefer emerging artists (lower popularity = higher penalty avoidance)
  const pop = candidate.popularity ?? 50;
  const popPenalty = pop > 70 ? 0.7 : pop > 50 ? 0.85 : 1.0;

  const finalScore = (
    0.25 * collabScore +
    0.30 * contentScore +
    0.20 * watchlistScore +
    0.15 * unsignedScore +
    0.10 * divScore
  ) * recency * popPenalty;

  // Build reason explanation
  const matchedGenres = (candidate.genre || []).filter((g: string) => userProfile.genreWeights[g] > 0.05);
  const reason: Record<string, any> = {
    genre_match: Math.round(genreSim * 100) / 100,
    matched_genres: matchedGenres.slice(0, 3),
    region_match: Math.round(regionSim * 100) / 100,
    audio_similarity: Math.round(audioSim * 100) / 100,
    collaborative_match: Math.round(collabScore * 100) / 100,
    watchlist_alignment: Math.round(watchlistScore * 100) / 100,
    unsigned_count: unsignedCount,
    popularity: pop,
  };

  return {
    score: Math.round(finalScore * 1000) / 1000,
    collaborative_score: Math.round(collabScore * 1000) / 1000,
    content_score: Math.round(contentScore * 1000) / 1000,
    watchlist_score: Math.round(watchlistScore * 1000) / 1000,
    unsigned_score: Math.round(unsignedScore * 1000) / 1000,
    diversity_score: Math.round(divScore * 1000) / 1000,
    reason,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, limit = 10, excludeSongIds = [], forceRefresh = false } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabase();

    // Check cache first (6-hour TTL)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("ml_recommendations")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .is("feedback", null)
        .order("score", { ascending: false })
        .limit(limit);

      if (cached && cached.length >= limit) {
        return new Response(JSON.stringify({ success: true, data: cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build user profile
    const userProfile = await buildUserProfile(userId, supabase);

    // If user has no history, use AI-based recommendations (fallback to existing system)
    if (userProfile.totalSearches === 0 && userProfile.feedbackHistory.length === 0) {
      return new Response(JSON.stringify({
        success: true, data: [], cached: false,
        message: "No search history — use AI recommendations as fallback",
        fallback: "ai",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get candidate songs pool
    const { data: candidates } = await supabase
      .from("ml_song_candidates")
      .select("*")
      .gt("unsigned_count", 0) // Must have unsigned talent
      .order("enriched_at", { ascending: false })
      .limit(500);

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [], cached: false, message: "No candidates in pool" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get collaborative filtering scores
    const collabScores = await getCollaborativeRecommendations(userId, userProfile, supabase);

    // Build IDF weights from candidate pool
    const docFreq: Record<string, number> = {};
    for (const c of candidates) {
      const seen = new Set<string>();
      for (const g of (c.genre || [])) {
        if (!seen.has(g)) { docFreq[g] = (docFreq[g] || 0) + 1; seen.add(g); }
      }
    }
    const totalDocs = candidates.length;
    const idfWeights: Record<string, number> = {};
    for (const [g, df] of Object.entries(docFreq)) {
      idfWeights[g] = Math.log(totalDocs / (df + 1)) + 1;
    }

    // Exclude already interacted songs
    const excludeSet = new Set([
      ...excludeSongIds,
      ...userProfile.feedbackHistory.map((f: any) => f.song_key),
    ]);

    // Score all candidates
    const alreadyRecommended: string[] = [];
    const scored = candidates
      .filter(c => !excludeSet.has(c.song_key))
      .map(c => {
        const collabScore = collabScores.get(c.song_key) || 0;
        const scores = scoreSong(c, userProfile, collabScore, alreadyRecommended, idfWeights);
        alreadyRecommended.push(c.song_key);
        return { ...c, ...scores };
      })
      .sort((a, b) => b.score - a.score);

    // Diversity injection: ensure 20% are outside comfort zone
    const topN = Math.ceil(limit * 0.8);
    const diverseN = limit - topN;
    const topPicks = scored.slice(0, topN);

    // Find diverse picks (highest diversity_score among remaining)
    const remaining = scored.slice(topN);
    remaining.sort((a, b) => b.diversity_score - a.diversity_score);
    const diversePicks = remaining.slice(0, diverseN);

    const finalPicks = [...topPicks, ...diversePicks]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Store recommendations in database
    const recsToStore = finalPicks.map(p => ({
      user_id: userId,
      song_candidate_id: p.id,
      title: p.title,
      artist: p.artist,
      score: p.score,
      collaborative_score: p.collaborative_score,
      content_score: p.content_score,
      watchlist_score: p.watchlist_score,
      unsigned_score: p.unsigned_score,
      diversity_score: p.diversity_score,
      reason: p.reason,
      unsigned_talent: p.unsigned_talent,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    }));

    // Clear old expired recommendations for this user
    await supabase
      .from("ml_recommendations")
      .delete()
      .eq("user_id", userId)
      .lt("expires_at", new Date().toISOString());

    // Insert new recommendations
    if (recsToStore.length > 0) {
      await supabase.from("ml_recommendations").insert(recsToStore);
    }

    // Update user profile
    await supabase
      .from("ml_user_profiles")
      .upsert({
        user_id: userId,
        genre_weights: userProfile.genreWeights,
        region_weights: userProfile.regionWeights,
        audio_preferences: userProfile.audioPrefs,
        popularity_min: userProfile.popularityMin,
        popularity_max: userProfile.popularityMax,
        total_searches: userProfile.totalSearches,
        total_watchlist_adds: userProfile.watchlistEntries.length,
      }, { onConflict: "user_id" });

    console.log(`ML recommendations for ${userId}: ${finalPicks.length} songs scored from ${candidates.length} candidates`);

    return new Response(JSON.stringify({
      success: true,
      data: finalPicks.map(p => ({
        id: p.id,
        songKey: p.song_key,
        title: p.title,
        artist: p.artist,
        spotifyUrl: p.spotify_url,
        score: p.score,
        scores: {
          collaborative: p.collaborative_score,
          content: p.content_score,
          watchlist: p.watchlist_score,
          unsigned: p.unsigned_score,
          diversity: p.diversity_score,
        },
        reason: p.reason,
        unsignedTalent: p.unsigned_talent,
        audioFeatures: {
          tempo: p.tempo, energy: p.energy, danceability: p.danceability,
          valence: p.valence, acousticness: p.acousticness,
        },
        genre: p.genre,
        region: p.region,
        popularity: p.popularity,
      })),
      cached: false,
      profileSummary: {
        topGenres: Object.entries(userProfile.genreWeights)
          .sort(([, a]: any, [, b]: any) => b - a).slice(0, 5).map(([g]) => g),
        topRegions: Object.entries(userProfile.regionWeights)
          .sort(([, a]: any, [, b]: any) => b - a).slice(0, 3).map(([r]) => r),
        watchlistCount: userProfile.watchlistEntries.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ML recommendation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
