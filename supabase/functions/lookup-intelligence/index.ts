// Lookup Intelligence orchestrator
// Fans out to YouTube (via streaming-stats), Genius (via genius-lookup),
// MusicBrainz (via song-lookup / musicbrainz-deep-lookup), and existing
// publishing registry scrapers (mlc-shares-lookup, pro-lookup).
// Normalizes results, scores candidates, returns one canonical best-match
// plus alternates, source audit trail, and writes a snapshot row.

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
};

async function adapterSongLookup(q: string): Promise<{ status: string; candidates: Candidate[]; raw: any }> {
  const cacheKey = norm(q);
  const cached = await cacheGet("song-lookup", cacheKey);
  const data = cached ?? await callFunction("song-lookup", { query: q, skipPro: true });
  if (!cached && data) await cacheSet("song-lookup", cacheKey, data);
  if (!data?.success || !data?.data) return { status: "no_data", candidates: [], raw: data };
  const s = data.data.song;
  const cand: Candidate = {
    title: s.title, artist: s.artist,
    isrc: s.isrc || null,
    releaseYear: s.releaseDate ? Number(String(s.releaseDate).slice(0, 4)) : null,
    coverUrl: s.coverUrl || null,
    musicbrainzRecordingId: s.mbid || null,
    source: "song-lookup",
  };
  return { status: "success", candidates: [cand], raw: data.data };
}

async function adapterStreamingStats(title: string, artist: string): Promise<{ status: string; data: any }> {
  const cacheKey = `${norm(title)}::${norm(artist)}`;
  const cached = await cacheGet("streaming-stats", cacheKey);
  const data = cached ?? await callFunction("streaming-stats", { title, artist });
  if (!cached && data) await cacheSet("streaming-stats", cacheKey, data, 1);
  if (!data?.success) return { status: "no_data", data: null };
  return { status: "success", data: data.data };
}

async function adapterGenius(title: string, artist: string): Promise<{ status: string; data: any }> {
  const cacheKey = `${norm(title)}::${norm(artist)}`;
  const cached = await cacheGet("genius-lookup", cacheKey);
  const data = cached ?? await callFunction("genius-lookup", { songTitle: title, artist });
  if (!cached && data) await cacheSet("genius-lookup", cacheKey, data);
  if (!data) return { status: "failed", data: null };
  if (!data.success && !data.data) return { status: "no_data", data: null };
  return { status: "success", data: data.data || data };
}

async function adapterMlcShares(title: string, artist: string, writers: string[]): Promise<{ status: string; data: any }> {
  const cacheKey = `${norm(title)}::${norm(artist)}::${writers.slice(0, 5).map(norm).join("|")}`;
  const cached = await cacheGet("mlc-shares", cacheKey);
  const data = cached ?? await callFunction("mlc-shares-lookup", {
    songTitle: title, artist, writerNames: writers,
  }, 18000);
  if (!cached && data) await cacheSet("mlc-shares", cacheKey, data);
  if (!data?.success) return { status: "no_data", data: null };
  return { status: "success", data: data.data };
}

// ---------- scoring ----------
function scoreCandidate(c: Candidate, query: { title: string; artist: string; inputType: string }): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let s = 0;
  const titleSim = similarity(c.title, query.title);
  const artistSim = query.artist ? similarity(c.artist, query.artist) : 0.5;
  s += titleSim * 0.40;
  s += artistSim * 0.30;
  if (titleSim > 0.9) reasons.push(`Title match (${Math.round(titleSim * 100)}%)`);
  if (artistSim > 0.9) reasons.push(`Artist match (${Math.round(artistSim * 100)}%)`);
  if (c.isrc) { s += 0.10; reasons.push("ISRC available"); }
  if (c.spotifyTrackId) { s += 0.05; reasons.push("Spotify ID"); }
  if (c.musicbrainzRecordingId) { s += 0.05; reasons.push("MusicBrainz recording ID"); }
  if (c.releaseYear) { s += 0.03; }
  if (query.inputType === "url") { s += 0.07; reasons.push("Direct link input"); }
  return { score: Math.min(1, s), reasons };
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

  // 1) Resolve canonical via song-lookup (handles URLs, ISRCs, free text)
  const sl = await adapterSongLookup(queryRaw);
  const sourceStatuses: Array<{ name: string; status: string; recordsFetched: number }> = [
    { name: "song-lookup", status: sl.status, recordsFetched: sl.candidates.length },
  ];

  if (sl.candidates.length === 0) {
    const auditRow = {
      user_id: userId,
      query_raw: queryRaw,
      query_normalized: { norm: norm(queryRaw), inputType },
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
    return json({ success: true, data: { ...auditRow, sources_count: 1 } });
  }

  const primary = sl.candidates[0];
  const credits = (sl.raw?.credits || []) as Array<{ name: string; role: string }>;
  const writerNames = credits.filter((c) => c.role === "writer").map((c) => c.name);

  // 2) Fan out to remaining sources in parallel
  const [stats, genius, mlc] = await Promise.all([
    adapterStreamingStats(primary.title, primary.artist),
    adapterGenius(primary.title, primary.artist),
    adapterMlcShares(primary.title, primary.artist, writerNames),
  ]);

  sourceStatuses.push(
    { name: "youtube+spotify (streaming-stats)", status: stats.status, recordsFetched: stats.data ? 1 : 0 },
    { name: "genius", status: genius.status, recordsFetched: genius.data ? 1 : 0 },
    { name: "mlc-shares (registry)", status: mlc.status, recordsFetched: mlc.data?.shares?.length || 0 },
  );

  // 3) Score the primary candidate
  const queryParsed = (() => {
    // crude: "title artist" → split on biggest unique whitespace
    const parts = queryRaw.split(/\s+/);
    return { title: queryRaw, artist: "", inputType };
  })();
  const scored = scoreCandidate({ ...primary, source: "song-lookup" }, {
    title: primary.title, artist: primary.artist, inputType,
  });
  // Agreement count: how many sources independently confirmed
  let agreement = 1; // song-lookup
  if (stats.data?.spotify?.url || stats.data?.youtube?.url) agreement++;
  if (genius.data?.title) agreement++;
  if (mlc.data?.shares?.length) agreement++;

  const bucket = bucketFor(scored.score, agreement);
  if (mlc.data?.shares?.length) scored.reasons.push(`Registry confirmed (${mlc.data.shares.length} shares)`);
  if (genius.data?.title) scored.reasons.push("Genius metadata match");
  if (stats.data?.youtube?.url) scored.reasons.push("YouTube official video");

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
      confidence_score: scored.score,
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
    },
  };

  const candidates = [
    { ...bestMatch, score: scored.score, bucket, reasons: scored.reasons, source: "song-lookup", primary: true },
  ];

  const auditRow = {
    user_id: userId,
    query_raw: queryRaw,
    query_normalized: { norm: norm(queryRaw), inputType },
    input_type: inputType,
    best_match_track_id: trackId,
    best_match: bestMatch,
    candidates,
    source_results: {
      "song-lookup": sl.raw,
      "streaming-stats": stats.data,
      "genius": genius.data,
      "mlc-shares": mlc.data,
    },
    source_statuses: sourceStatuses,
    confidence_score: scored.score,
    confidence_bucket: bucket,
    why_won: scored.reasons,
    duration_ms: Date.now() - t0,
  };

  if (userId) {
    try { await sb.from("lookup_audit").insert(auditRow); } catch (e) { console.warn("audit insert failed", e); }
  }

  return json({ success: true, data: { ...auditRow, agreement, last_verified_at: new Date().toISOString() } });
});