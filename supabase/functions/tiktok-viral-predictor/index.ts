// TikTok Viral Predictor edge function.
//
// Two modes:
//  - { song_title, artist }: collect a TikTok snapshot via SearchApi, store it,
//    compute a viral score (0-100) using current signals + week-over-week velocity
//    from prior snapshots, generate a short AI rationale, persist & return.
//  - { leaderboard: true, limit }: return the top N tracks from tiktok_viral_scores.
//
// Fail-closed: if SearchApi is unreachable we return status:"error" and do NOT
// fabricate signals. Score is heuristic + transparent driver breakdown so it can
// be replaced with a trained model later (snapshots accumulate the labels).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SEARCHAPI_BASE = "https://www.searchapi.io/api/v1/search";

interface TikTokSignals {
  video_count: number;
  unique_creators: number;
  total_views: number;
  total_likes: number;
  top_creators: Array<{ username: string; views?: number | null; likes?: number | null; url?: string | null }>;
}

interface DiscoveredTrack {
  title: string;
  artist: string;
  music_id?: string | null;
  total_views: number;
  video_count: number;
  unique_creators: number;
}

// Seed queries that surface fresh trending music on TikTok. We deliberately
// query "discovery" terms instead of a known song so the API returns whatever
// TikTok's own ranking is currently pushing.
const DISCOVERY_SEEDS = [
  "viral song",
  "trending sound",
  "new music",
  "fyp song",
  "song of the week",
  "tiktok music",
];

function pickStr(...vals: any[]): string {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

/**
 * Extract a (title, artist, music_id) tuple from a TikTok search result item.
 * SearchApi shapes vary, so we look at music/music_meta/track fields and fall
 * back to splitting strings like "Song Title - Artist Name".
 */
function extractMusic(item: any): { title: string; artist: string; music_id?: string | null } | null {
  const music = item?.music || item?.music_meta || item?.music_info || item?.track || {};
  let title = pickStr(music?.title, music?.name, music?.song, item?.music_title, item?.song_title);
  let artist = pickStr(music?.author, music?.author_name, music?.artist, item?.music_author, item?.song_artist);
  const music_id = pickStr(music?.id, music?.music_id, item?.music_id) || null;

  if (!title) {
    const combined = pickStr(item?.music_name, item?.music);
    const m = combined.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (m) { title = m[1].trim(); artist = artist || m[2].trim(); }
  }
  if (!title) return null;
  if (!artist) artist = pickStr(item?.author?.nickname, item?.author?.unique_id) || "Unknown";
  // Filter out obvious junk
  if (title.length > 200 || artist.length > 200) return null;
  if (/^original sound/i.test(title)) return null; // skip generic UGC sounds
  return { title, artist, music_id };
}

async function discoverTrendingTracks(apiKey: string, perSeed = 30): Promise<DiscoveredTrack[]> {
  const agg = new Map<string, DiscoveredTrack>();
  const results = await Promise.all(DISCOVERY_SEEDS.map(async (q) => {
    try {
      const url = `${SEARCHAPI_BASE}?engine=tiktok_search&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) return [];
      const data = await r.json();
      const items: any[] = data?.videos || data?.results || [];
      return items.slice(0, perSeed);
    } catch { return []; }
  }));
  for (const items of results) {
    for (const v of items) {
      const m = extractMusic(v);
      if (!m) continue;
      const key = `${m.title.toLowerCase()}||${m.artist.toLowerCase()}`;
      const views = Number(v?.play_count ?? v?.statistics?.play_count ?? 0) || 0;
      const creator = pickStr(v?.author?.unique_id, v?.author?.username);
      const cur = agg.get(key) || { title: m.title, artist: m.artist, music_id: m.music_id, total_views: 0, video_count: 0, unique_creators: 0, _creators: new Set<string>() } as any;
      cur.total_views += views;
      cur.video_count += 1;
      if (creator) (cur._creators as Set<string>).add(creator);
      cur.unique_creators = (cur._creators as Set<string>).size;
      agg.set(key, cur);
    }
  }
  // Strip helper field, sort by a simple discovery score (views * creator diversity)
  return Array.from(agg.values())
    .map((t: any) => ({ title: t.title, artist: t.artist, music_id: t.music_id, total_views: t.total_views, video_count: t.video_count, unique_creators: t.unique_creators }))
    .sort((a, b) => (b.total_views * Math.max(1, b.unique_creators)) - (a.total_views * Math.max(1, a.unique_creators)));
}

async function fetchTikTokSignals(apiKey: string, query: string): Promise<TikTokSignals | null> {
  const url = `${SEARCHAPI_BASE}?engine=tiktok_search&q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return null;
    const data = await r.json();
    const items: any[] = data?.videos || data?.results || [];
    if (!items.length) return { video_count: 0, unique_creators: 0, total_views: 0, total_likes: 0, top_creators: [] };
    const creators = new Map<string, { views: number; likes: number; url?: string }>();
    let total_views = 0;
    let total_likes = 0;
    for (const v of items) {
      const username = v?.author?.unique_id || v?.author?.username || "";
      const views = Number(v?.play_count ?? v?.statistics?.play_count ?? 0) || 0;
      const likes = Number(v?.digg_count ?? v?.statistics?.digg_count ?? 0) || 0;
      total_views += views;
      total_likes += likes;
      if (username) {
        const cur = creators.get(username) || { views: 0, likes: 0, url: v?.url || v?.video_url || undefined };
        cur.views += views;
        cur.likes += likes;
        creators.set(username, cur);
      }
    }
    const top = Array.from(creators.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 6)
      .map(([username, m]) => ({ username, views: m.views, likes: m.likes, url: m.url || null }));
    return {
      video_count: items.length,
      unique_creators: creators.size,
      total_views,
      total_likes,
      top_creators: top,
    };
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function logScale(value: number, ceiling: number) {
  if (value <= 0) return 0;
  return clamp((Math.log10(value + 1) / Math.log10(ceiling + 1)) * 100, 0, 100);
}

/**
 * Heuristic viral score (0-100). Weights chosen so a track with broad creator
 * diversity AND positive week-over-week growth scores highest. All inputs are
 * normalised on a log scale so a few outliers don't dominate.
 */
function computeScore(current: TikTokSignals, prior?: { video_count: number | null; total_views: number | null }) {
  const videoComponent = logScale(current.video_count, 50_000); // ceiling: 50k videos
  const creatorComponent = logScale(current.unique_creators, 10_000);
  const viewsComponent = logScale(current.total_views, 500_000_000);
  const engagementRatio = current.total_views > 0 ? clamp((current.total_likes / current.total_views) * 100, 0, 25) * 4 : 0; // 0-100

  let velocityComponent = 0;
  let weekly_change_pct = 0;
  if (prior && prior.video_count != null && prior.video_count > 0) {
    weekly_change_pct = ((current.video_count - prior.video_count) / prior.video_count) * 100;
    // Map: -100% -> 0, 0% -> 50, +200% -> 100
    velocityComponent = clamp(50 + (weekly_change_pct / 4), 0, 100);
  } else {
    velocityComponent = 50; // neutral when no prior data
  }

  // Weighted average
  const score =
    videoComponent * 0.20 +
    creatorComponent * 0.25 +
    viewsComponent * 0.20 +
    engagementRatio * 0.10 +
    velocityComponent * 0.25;

  let trajectory: "viral" | "rising" | "steady" | "cooling" = "steady";
  if (weekly_change_pct >= 100 && score >= 70) trajectory = "viral";
  else if (weekly_change_pct >= 25) trajectory = "rising";
  else if (weekly_change_pct <= -25) trajectory = "cooling";

  return {
    score: Math.round(score * 10) / 10,
    trajectory,
    weekly_change_pct: Math.round(weekly_change_pct * 10) / 10,
    drivers: {
      videos: Math.round(videoComponent),
      creators: Math.round(creatorComponent),
      views: Math.round(viewsComponent),
      engagement: Math.round(engagementRatio),
      velocity: Math.round(velocityComponent),
    },
  };
}

async function generateRationale(apiKey: string, song: string, artist: string, signals: TikTokSignals, scoring: ReturnType<typeof computeScore>): Promise<string | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a music A&R analyst. Write a single concise sentence (max 30 words) explaining why a track's TikTok viral score is what it is. Mention concrete drivers (creator count, velocity, engagement). No hype words. No emoji." },
          { role: "user", content: `Song: "${song}" by ${artist}\nViral score: ${scoring.score}/100 (trajectory: ${scoring.trajectory})\nVideos: ${signals.video_count}\nUnique creators: ${signals.unique_creators}\nTotal views: ${signals.total_views}\nWeek-over-week change: ${scoring.weekly_change_pct}%\nDrivers: ${JSON.stringify(scoring.drivers)}` },
        ],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));

    // --- Leaderboard mode ---
    if (body?.leaderboard) {
      const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
      const { data, error } = await supabase
        .from("tiktok_viral_scores")
        .select("*")
        .order("score", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return new Response(JSON.stringify({ leaderboard: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Discovery mode: live TikTok-trending sweep, score top N tracks ---
    if (body?.discover) {
      const searchApiKey = Deno.env.get("SEARCHAPI_API_KEY");
      if (!searchApiKey) {
        return new Response(JSON.stringify({ error: "SEARCHAPI_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const topN = Math.min(Math.max(Number(body?.limit) || 12, 1), 25);
      const discovered = await discoverTrendingTracks(searchApiKey);
      const top = discovered.slice(0, topN);
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      const scored: any[] = [];
      for (const t of top) {
        const signals = await fetchTikTokSignals(searchApiKey, `${t.title} ${t.artist}`);
        if (!signals) continue;
        const songKey = `${t.title.toLowerCase()}||${t.artist.toLowerCase()}`;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: priorRows } = await supabase
          .from("tiktok_viral_snapshots")
          .select("video_count, total_views, captured_at")
          .eq("song_key", songKey)
          .lt("captured_at", sevenDaysAgo)
          .order("captured_at", { ascending: false })
          .limit(1);
        const prior = priorRows?.[0];
        const scoring = computeScore(signals, prior ? { video_count: prior.video_count, total_views: prior.total_views } : undefined);
        await supabase.from("tiktok_viral_snapshots").insert({
          song_title: t.title, artist: t.artist,
          video_count: signals.video_count, unique_creators: signals.unique_creators,
          total_views: signals.total_views, total_likes: signals.total_likes,
          top_creators: signals.top_creators,
        });
        let rationale: string | null = null;
        if (lovableKey) rationale = await generateRationale(lovableKey, t.title, t.artist, signals, scoring);
        await supabase.from("tiktok_viral_scores").upsert({
          song_title: t.title, artist: t.artist,
          score: scoring.score, trajectory: scoring.trajectory, drivers: scoring.drivers,
          rationale,
          video_count: signals.video_count, unique_creators: signals.unique_creators,
          total_views: signals.total_views, total_likes: signals.total_likes,
          weekly_change_pct: scoring.weekly_change_pct,
          computed_at: new Date().toISOString(),
        }, { onConflict: "song_key" });
        scored.push({ title: t.title, artist: t.artist, score: scoring.score, trajectory: scoring.trajectory });
      }
      return new Response(JSON.stringify({ status: "ok", mode: "discover", discovered: discovered.length, scored }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Predict mode ---
    const title = typeof body?.song_title === "string" ? body.song_title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    if (!title || !artist || title.length > 300 || artist.length > 300) {
      return new Response(JSON.stringify({ error: "song_title and artist required (<=300 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchApiKey = Deno.env.get("SEARCHAPI_API_KEY");
    if (!searchApiKey) {
      return new Response(JSON.stringify({ error: "SEARCHAPI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const songKey = `${title.toLowerCase()}||${artist.toLowerCase()}`;
    const signals = await fetchTikTokSignals(searchApiKey, `${title} ${artist}`);
    if (!signals) {
      return new Response(JSON.stringify({ status: "error", error: "TikTok signal fetch failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up prior snapshot (~7 days ago) for velocity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: priorRows } = await supabase
      .from("tiktok_viral_snapshots")
      .select("video_count, total_views, captured_at")
      .eq("song_key", songKey)
      .lt("captured_at", sevenDaysAgo)
      .order("captured_at", { ascending: false })
      .limit(1);
    const prior = priorRows?.[0];

    const scoring = computeScore(signals, prior ? { video_count: prior.video_count, total_views: prior.total_views } : undefined);

    // Persist snapshot
    await supabase.from("tiktok_viral_snapshots").insert({
      song_title: title,
      artist,
      video_count: signals.video_count,
      unique_creators: signals.unique_creators,
      total_views: signals.total_views,
      total_likes: signals.total_likes,
      top_creators: signals.top_creators,
    });

    // AI rationale (best-effort)
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    let rationale: string | null = null;
    if (lovableKey) {
      rationale = await generateRationale(lovableKey, title, artist, signals, scoring);
    }

    // Upsert latest score
    const scoreRow = {
      song_title: title,
      artist,
      score: scoring.score,
      trajectory: scoring.trajectory,
      drivers: scoring.drivers,
      rationale,
      video_count: signals.video_count,
      unique_creators: signals.unique_creators,
      total_views: signals.total_views,
      total_likes: signals.total_likes,
      weekly_change_pct: scoring.weekly_change_pct,
      computed_at: new Date().toISOString(),
    };
    await supabase.from("tiktok_viral_scores").upsert(scoreRow, { onConflict: "song_key" });

    return new Response(JSON.stringify({
      status: "ok",
      score: scoring.score,
      trajectory: scoring.trajectory,
      drivers: scoring.drivers,
      weekly_change_pct: scoring.weekly_change_pct,
      signals,
      rationale,
      has_prior_snapshot: !!prior,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});