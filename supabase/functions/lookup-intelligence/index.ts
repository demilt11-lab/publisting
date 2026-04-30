// Lookup Intelligence orchestrator
// Phase 2: smarter query parsing, multi-candidate generation, weighted
// scoring with explainable breakdown, manual override check, source health
// telemetry, and snapshot-on-every-lookup. Reuses song-lookup,
// streaming-stats, genius-lookup, mlc-shares-lookup, musicbrainz-deep-lookup.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- helpers ----------
function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function trigrams(s: string): Set<string> {
  const t = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
function similarity(a: string, b: string): number {
  const an = norm(a), bn = norm(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  const A = trigrams(an), B = trigrams(bn);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

// Strip variant tags so "song (sped up) - Artist" still scores well
const VARIANT_RX = /\b(sped\s*up|slowed(?:\s*\+\s*reverb)?|reverb|live|acoustic|remix|remaster(?:ed)?|instrumental|karaoke|lyric(?:s)?|visualizer|clean|explicit|edit|version|radio edit|extended)\b/gi;
function stripVariants(s: string): { clean: string; tags: string[] } {
  const tags: string[] = [];
  const clean = (s || "").replace(VARIANT_RX, (m) => { tags.push(m.toLowerCase()); return " "; })
    .replace(/[\(\)\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return { clean, tags };
}

// Naive title/artist split for free-text queries:
//   "Espresso Sabrina Carpenter" or "Espresso - Sabrina Carpenter" or "Espresso by Sabrina Carpenter"
function parseTitleArtist(q: string): { title: string; artist: string } {
  const sep = q.match(/^(.+?)\s+(?:-|—|–|by|·|\|)\s+(.+)$/i);
  if (sep) return { title: sep[1].trim(), artist: sep[2].trim() };
  // Fall back: assume last 2 words = artist if 3+ tokens
  const parts = q.trim().split(/\s+/);
  if (parts.length >= 3) {
    return { title: parts.slice(0, parts.length - 2).join(" "), artist: parts.slice(-2).join(" ") };
  }
  return { title: q.trim(), artist: "" };
}

// Simple URL detection for direct-link inputs
function detectInputType(q: string): "url" | "isrc" | "text" {
  if (/^https?:\/\//i.test(q)) return "url";
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(q.replace(/[-\s]/g, ""))) return "isrc";
  return "text";
}

// Cache helpers
async function cacheGet(source: string, key: string): Promise<any | null> {
  try {
    const { data } = await sb.from("lookup_source_cache")
      .select("data, expires_at").eq("source", source).eq("cache_key", key).maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.data;
  } catch { return null; }
}
async function cacheSet(source: string, key: string, data: any, ttlDays = 7) {
  try {
    await sb.from("lookup_source_cache").upsert({
      source, cache_key: key, data,
      expires_at: new Date(Date.now() + ttlDays * 86400000).toISOString(),
    }, { onConflict: "source,cache_key" });
  } catch {}
}

// ---------- source health telemetry ----------
async function recordHealth(source: string, status: string, latencyMs: number, fromCache: boolean, errorMsg?: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await sb.from("source_health")
      .select("*").eq("source", source).eq("date", today).maybeSingle();
    const row: any = existing ?? {
      source, date: today,
      success_count: 0, partial_count: 0, failed_count: 0, no_data_count: 0,
      cache_hits: 0, total_latency_ms: 0,
    };
    if (fromCache) row.cache_hits += 1;
    if (status === "success") row.success_count += 1;
    else if (status === "partial") row.partial_count += 1;
    else if (status === "no_data") row.no_data_count += 1;
    else row.failed_count += 1;
    row.total_latency_ms = (row.total_latency_ms || 0) + latencyMs;
    if (errorMsg) row.last_error = errorMsg.slice(0, 500);
    row.last_seen_at = new Date().toISOString();
    if (existing) await sb.from("source_health").update(row).eq("id", existing.id);
    else await sb.from("source_health").insert(row);
  } catch (e) { console.warn("source_health write failed", e); }
}

// Invoke another edge function with timeout + caching
async function callFunction(name: string, body: any, timeoutMs = 12000): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ---------- adapters ----------
type Candidate = {
  title: string;
  artist: string;
  isrc?: string | null;
  releaseYear?: number | null;
  spotifyTrackId?: string | null;
  appleTrackId?: string | null;
  youtubeVideoId?: string | null;
  geniusSongId?: number | null;
  musicbrainzRecordingId?: string | null;
  coverUrl?: string | null;
  source: string;
  variantTags?: string[];
};

async function adapterSongLookup(q: string): Promise<{ status: string; candidates: Candidate[]; raw: any }> {
  const t0 = Date.now();
  const cacheKey = norm(q);
  const cached = await cacheGet("song-lookup", cacheKey);
  const data = cached ?? await callFunction("song-lookup", { query: q, skipPro: true });
  if (!cached && data) await cacheSet("song-lookup", cacheKey, data);
  if (!data?.success || !data?.data) {
    await recordHealth("song-lookup", "no_data", Date.now() - t0, !!cached);
    return { status: "no_data", candidates: [], raw: data };
  }
  const s = data.data.song;
  const cand: Candidate = {
    title: s.title, artist: s.artist,
    isrc: s.isrc || null,
    releaseYear: s.releaseDate ? Number(String(s.releaseDate).slice(0, 4)) : null,
    coverUrl: s.coverUrl || null,
    musicbrainzRecordingId: s.mbid || null,
    source: "song-lookup",
  };
  await recordHealth("song-lookup", "success", Date.now() - t0, !!cached);
  return { status: "success", candidates: [cand], raw: data.data };
}

async function adapterStreamingStats(title: string, artist: string): Promise<{ status: string; data: any }> {
  const t0 = Date.now();
  const cacheKey = `${norm(title)}::${norm(artist)}`;
  const cached = await cacheGet("streaming-stats", cacheKey);
  const data = cached ?? await callFunction("streaming-stats", { title, artist });
  if (!cached && data) await cacheSet("streaming-stats", cacheKey, data, 1);
  if (!data?.success) {
    await recordHealth("streaming-stats", data ? "no_data" : "failed", Date.now() - t0, !!cached);
    return { status: "no_data", data: null };
  }
  await recordHealth("streaming-stats", "success", Date.now() - t0, !!cached);
  return { status: "success", data: data.data };
}

async function adapterGenius(title: string, artist: string): Promise<{ status: string; data: any }> {
  const t0 = Date.now();
  const cacheKey = `${norm(title)}::${norm(artist)}`;
  const cached = await cacheGet("genius-lookup", cacheKey);
  const data = cached ?? await callFunction("genius-lookup", { songTitle: title, artist });
  if (!cached && data) await cacheSet("genius-lookup", cacheKey, data);
  if (!data) { await recordHealth("genius", "failed", Date.now() - t0, !!cached); return { status: "failed", data: null }; }
  if (!data.success && !data.data) { await recordHealth("genius", "no_data", Date.now() - t0, !!cached); return { status: "no_data", data: null }; }
  await recordHealth("genius", "success", Date.now() - t0, !!cached);
  return { status: "success", data: data.data || data };
}

async function adapterMlcShares(title: string, artist: string, writers: string[]): Promise<{ status: string; data: any }> {
  const t0 = Date.now();
  const cacheKey = `${norm(title)}::${norm(artist)}::${writers.slice(0, 5).map(norm).join("|")}`;
  const cached = await cacheGet("mlc-shares", cacheKey);
  const data = cached ?? await callFunction("mlc-shares-lookup", {
    songTitle: title, artist, writerNames: writers,
  }, 18000);
  if (!cached && data) await cacheSet("mlc-shares", cacheKey, data);
  if (!data?.success) { await recordHealth("mlc-shares", data ? "no_data" : "failed", Date.now() - t0, !!cached); return { status: "no_data", data: null }; }
  await recordHealth("mlc-shares", "success", Date.now() - t0, !!cached);
  return { status: "success", data: data.data };
}

async function adapterMbDeep(title: string, artist: string): Promise<{ status: string; data: any }> {
  const t0 = Date.now();
  const cacheKey = `${norm(title)}::${norm(artist)}`;
  const cached = await cacheGet("musicbrainz-deep", cacheKey);
  const data = cached ?? await callFunction("musicbrainz-deep-lookup", { songTitle: title, artistName: artist }, 15000);
  if (!cached && data) await cacheSet("musicbrainz-deep", cacheKey, data);
  if (!data?.success) { await recordHealth("musicbrainz", data ? "no_data" : "failed", Date.now() - t0, !!cached); return { status: "no_data", data: null }; }
  await recordHealth("musicbrainz", "success", Date.now() - t0, !!cached);
  return { status: "success", data: data.data };
}

// ---------- scoring ----------
type ScoreBreakdown = {
  titleSim: number;
  artistSim: number;
  identifierBoost: number;
  agreementBoost: number;
  freshnessBoost: number;
  registryBoost: number;
  variantPenalty: number;
  inputBoost: number;
};

function scoreCandidate(
  c: Candidate,
  q: { title: string; artist: string; inputType: string; variantTags: string[] },
  context: { agreement: number; registryShares: number; freshDays: number; verifiedSources: number },
): { score: number; reasons: string[]; breakdown: ScoreBreakdown } {
  const reasons: string[] = [];
  const titleSim = similarity(stripVariants(c.title).clean, stripVariants(q.title).clean);
  const artistSim = q.artist ? similarity(c.artist, q.artist) : 0.6;

  let identifierBoost = 0;
  if (c.isrc) { identifierBoost += 0.10; reasons.push("ISRC present"); }
  if (c.spotifyTrackId) { identifierBoost += 0.04; reasons.push("Spotify ID"); }
  if (c.musicbrainzRecordingId) { identifierBoost += 0.04; reasons.push("MusicBrainz recording ID"); }
  if (c.youtubeVideoId) identifierBoost += 0.02;

  const agreementBoost = Math.min(0.15, (context.agreement - 1) * 0.05);
  if (context.agreement >= 3) reasons.push(`${context.agreement} sources agree`);

  const registryBoost = context.registryShares > 0 ? 0.10 : 0;
  if (registryBoost) reasons.push(`Registry-confirmed (${context.registryShares} shares)`);

  const freshnessBoost = context.freshDays <= 7 ? 0.04 : 0;

  // Penalize obvious variant uploads when the user query was clean
  const candVariants = (c.variantTags || []).filter((t) => !q.variantTags.includes(t));
  const variantPenalty = candVariants.length > 0 ? Math.min(0.15, candVariants.length * 0.05) : 0;
  if (variantPenalty) reasons.push(`Variant penalty (${candVariants.join(", ")})`);

  const inputBoost = q.inputType === "url" || q.inputType === "isrc" ? 0.07 : 0;
  if (inputBoost) reasons.push(q.inputType === "url" ? "Direct link input" : "ISRC input");

  if (titleSim > 0.92) reasons.unshift(`Title match ${Math.round(titleSim * 100)}%`);
  if (artistSim > 0.92) reasons.unshift(`Artist match ${Math.round(artistSim * 100)}%`);

  const score = Math.max(
    0,
    Math.min(
      1,
      titleSim * 0.38 +
        artistSim * 0.27 +
        identifierBoost +
        agreementBoost +
        registryBoost +
        freshnessBoost +
        inputBoost -
        variantPenalty,
    ),
  );

  return {
    score,
    reasons,
    breakdown: {
      titleSim, artistSim, identifierBoost, agreementBoost,
      freshnessBoost, registryBoost, variantPenalty, inputBoost,
    },
  };
}

function ambiguityFlag(scored: Array<{ score: number }>): boolean {
  if (scored.length < 2) return false;
  return Math.abs(scored[0].score - scored[1].score) < 0.06;
}

function bucketFor(score: number, agreementCount: number): string {
  if (score >= 0.92 && agreementCount >= 3) return "exact";
  if (score >= 0.82 && agreementCount >= 2) return "strong";
  if (score >= 0.65) return "probable";
  if (score >= 0.45) return "ambiguous";
  return "low";
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  let userId: string | null = null;
  try {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data } = await sb.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }
  } catch {}

  let body: any = {};
  try { body = await req.json(); } catch {}
  const queryRaw: string = String(body.query || "").trim();
  if (!queryRaw) return json({ success: false, error: "query required" }, 400);

  const inputType = detectInputType(queryRaw);
  const queryNorm = norm(queryRaw);
  const parsed = parseTitleArtist(queryRaw);
  const queryVariants = stripVariants(queryRaw).tags;

  // 0) Manual override short-circuit
  try {
    const { data: ov } = await sb.from("manual_match_overrides")
      .select("*").eq("query_normalized", queryNorm)
      .or(userId ? `is_global.eq.true,user_id.eq.${userId}` : `is_global.eq.true`)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (ov?.pinned_payload && Object.keys(ov.pinned_payload || {}).length > 0) {
      return json({
        success: true,
        data: {
          ...ov.pinned_payload,
          override: { pinned: true, reason: ov.reason, by_user: ov.user_id, is_global: ov.is_global },
          last_verified_at: new Date().toISOString(),
        },
      });
    }
  } catch (e) { console.warn("override check failed", e); }

  // 1) Resolve canonical via song-lookup (handles URLs, ISRCs, free text)
  const sl = await adapterSongLookup(queryRaw);
  const sourceStatuses: Array<{ name: string; status: string; recordsFetched: number }> = [
    { name: "song-lookup", status: sl.status, recordsFetched: sl.candidates.length },
  ];

  if (sl.candidates.length === 0) {
    const auditRow = {
      user_id: userId,
      query_raw: queryRaw,
      query_normalized: { norm: queryNorm, inputType, parsed },
      input_type: inputType,
      best_match: null,
      candidates: [],
      source_results: { "song-lookup": sl.raw },
      source_statuses: sourceStatuses,
      confidence_score: 0,
      confidence_bucket: "low",
      why_won: ["No primary match found by song-lookup"],
      duration_ms: Date.now() - t0,
    };
    if (userId) await sb.from("lookup_audit").insert(auditRow);
    return json({ success: true, data: { ...auditRow, sources_count: 1, ambiguous: false } });
  }

  const primary = sl.candidates[0];
  const credits = (sl.raw?.credits || []) as Array<{ name: string; role: string }>;
  const writerNames = credits.filter((c) => c.role === "writer").map((c) => c.name);
  const producerNames = credits.filter((c) => c.role === "producer").map((c) => c.name);

  // 2) Fan out to remaining sources in parallel
  const [stats, genius, mlc, mbDeep] = await Promise.all([
    adapterStreamingStats(primary.title, primary.artist),
    adapterGenius(primary.title, primary.artist),
    adapterMlcShares(primary.title, primary.artist, writerNames),
    adapterMbDeep(primary.title, primary.artist),
  ]);

  sourceStatuses.push(
    { name: "youtube+spotify (streaming-stats)", status: stats.status, recordsFetched: stats.data ? 1 : 0 },
    { name: "genius", status: genius.status, recordsFetched: genius.data ? 1 : 0 },
    { name: "mlc-shares (registry)", status: mlc.status, recordsFetched: mlc.data?.shares?.length || 0 },
    { name: "musicbrainz-deep", status: mbDeep.status, recordsFetched: mbDeep.data?.credits?.length || 0 },
  );

  // 3) Build candidate list (primary + alternates harvested from sources)
  const candidatesRaw: Candidate[] = [{ ...primary }];
  // Genius alt
  if (genius.data?.title && (similarity(genius.data.title, primary.title) < 0.95 || similarity(genius.data.primaryArtist || "", primary.artist) < 0.95)) {
    candidatesRaw.push({
      title: genius.data.title,
      artist: genius.data.primaryArtist || primary.artist,
      geniusSongId: genius.data.id || null,
      coverUrl: genius.data.coverUrl || null,
      source: "genius",
    });
  }
  // MusicBrainz alt
  if (mbDeep.data?.title && similarity(mbDeep.data.title, primary.title) < 0.95) {
    candidatesRaw.push({
      title: mbDeep.data.title,
      artist: mbDeep.data.artist || primary.artist,
      isrc: mbDeep.data.isrc || null,
      musicbrainzRecordingId: mbDeep.data.recordingId || null,
      source: "musicbrainz",
    });
  }

  // Agreement: how many independent sources confirmed the primary
  let agreement = 1;
  if (stats.data?.spotify?.url || stats.data?.youtube?.url) agreement++;
  if (genius.data?.title) agreement++;
  if (mlc.data?.shares?.length) agreement++;
  if (mbDeep.data?.credits?.length) agreement++;

  const scoreCtx = {
    agreement,
    registryShares: mlc.data?.shares?.length || 0,
    freshDays: 0,
    verifiedSources: agreement,
  };

  const scoredCandidates = candidatesRaw.map((c) => {
    const s = scoreCandidate(c, { title: parsed.title || primary.title, artist: parsed.artist || primary.artist, inputType, variantTags: queryVariants }, scoreCtx);
    return { cand: c, ...s };
  }).sort((a, b) => b.score - a.score);

  const top = scoredCandidates[0];
  const bucket = bucketFor(top.score, agreement);
  const ambiguous = ambiguityFlag(scoredCandidates);
  if (ambiguous) top.reasons.push("⚠ Top candidates are within 6% — review alternates");

  // 4) Upsert canonical track
  let trackId: string | null = null;
  try {
    const { data: existing } = await sb.from("canonical_tracks").select("id")
      .eq("title_lower", norm(primary.title))
      .eq("primary_artist_lower", norm(primary.artist))
      .maybeSingle();
    if (existing?.id) {
      trackId = existing.id;
      await sb.from("canonical_tracks").update({
        isrc: primary.isrc || undefined,
        release_year: primary.releaseYear || undefined,
        cover_url: primary.coverUrl || undefined,
        musicbrainz_recording_id: primary.musicbrainzRecordingId || undefined,
        youtube_video_id: stats.data?.youtube?.url?.match(/v=([^&]+)/)?.[1] || undefined,
        genius_song_id: genius.data?.id ? String(genius.data.id) : undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { data: ins } = await sb.from("canonical_tracks").insert({
        title: primary.title,
        title_lower: norm(primary.title),
        primary_artist: primary.artist,
        primary_artist_lower: norm(primary.artist),
        isrc: primary.isrc,
        release_year: primary.releaseYear,
        cover_url: primary.coverUrl,
        musicbrainz_recording_id: primary.musicbrainzRecordingId,
        youtube_video_id: stats.data?.youtube?.url?.match(/v=([^&]+)/)?.[1] || null,
        genius_song_id: genius.data?.id ? String(genius.data.id) : null,
      }).select("id").maybeSingle();
      trackId = ins?.id ?? null;
    }
  } catch (e) {
    console.warn("canonical_tracks upsert failed", e);
  }

  // 5) Snapshot
  try {
    await sb.from("lookup_snapshots").insert({
      track_id: trackId,
      track_key: `${norm(primary.title)}::${norm(primary.artist)}`,
      spotify_popularity: stats.data?.spotify?.popularity ?? null,
      spotify_stream_count: stats.data?.spotify?.streamCount ?? null,
      youtube_view_count: stats.data?.youtube?.viewCount ? Number(String(stats.data.youtube.viewCount).replace(/[^\d]/g, "")) || null : null,
      genius_pageviews: stats.data?.genius?.pageviews ?? null,
      shazam_count: stats.data?.shazam?.count ?? null,
      source_coverage: sourceStatuses.filter((s) => s.status === "success").length,
      confidence_score: top.score,
      raw: { sources: sourceStatuses, agreement },
    });
  } catch (e) {
    console.warn("snapshot insert failed", e);
  }

  // 6) Build best match payload
  const bestMatch = {
    track_id: trackId,
    title: primary.title,
    artist: primary.artist,
    isrc: primary.isrc,
    releaseYear: primary.releaseYear,
    coverUrl: primary.coverUrl,
    musicbrainzRecordingId: primary.musicbrainzRecordingId,
    platforms: {
      spotify: { url: stats.data?.spotify?.url ?? null, popularity: stats.data?.spotify?.popularity ?? null },
      youtube: { url: stats.data?.youtube?.url ?? null, views: stats.data?.youtube?.viewCount ?? null },
      genius: { url: genius.data?.url ?? null, pageviews: stats.data?.genius?.pageviews ?? null, id: genius.data?.id ?? null },
      shazam: { count: stats.data?.shazam?.count ?? null, url: stats.data?.shazam?.url ?? null },
    },
    publishing: {
      collectingPublishers: mlc.data?.collectingPublishers || [],
      shares: mlc.data?.shares || [],
      detectedOrgs: mlc.data?.detectedOrgs || [],
      writers: writerNames,
      producers: producerNames,
    },
  };

  const candidates = scoredCandidates.map((sc, i) => ({
    ...bestMatch,
    title: sc.cand.title,
    artist: sc.cand.artist,
    isrc: sc.cand.isrc ?? bestMatch.isrc,
    musicbrainzRecordingId: sc.cand.musicbrainzRecordingId ?? bestMatch.musicbrainzRecordingId,
    score: sc.score,
    bucket: bucketFor(sc.score, agreement),
    reasons: sc.reasons,
    breakdown: sc.breakdown,
    source: sc.cand.source,
    primary: i === 0,
  }));

  const auditRow = {
    user_id: userId,
    query_raw: queryRaw,
    query_normalized: { norm: queryNorm, inputType, parsed },
    input_type: inputType,
    best_match_track_id: trackId,
    best_match: bestMatch,
    candidates,
    source_results: {
      "song-lookup": sl.raw,
      "streaming-stats": stats.data,
      "genius": genius.data,
      "mlc-shares": mlc.data,
      "musicbrainz-deep": mbDeep.data,
    },
    source_statuses: sourceStatuses,
    confidence_score: top.score,
    confidence_bucket: bucket,
    why_won: top.reasons,
    duration_ms: Date.now() - t0,
  };

  if (userId) {
    try { await sb.from("lookup_audit").insert(auditRow); } catch (e) { console.warn("audit insert failed", e); }
  }

  return json({
    success: true,
    data: {
      ...auditRow,
      agreement,
      ambiguous,
      breakdown: top.breakdown,
      last_verified_at: new Date().toISOString(),
    },
  });
});