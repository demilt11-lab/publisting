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

// Seed queries that surface fresh trending music on TikTok via Google.
// SearchApi has no native TikTok engine, so we constrain Google to
// tiktok.com/music/* (TikTok's per-sound pages) and tiktok.com/@*/video/*.
const DISCOVERY_SEEDS = [
  "site:tiktok.com/music trending",
  "site:tiktok.com/music viral",
  "site:tiktok.com/music new song",
  "site:tiktok.com viral sound",
  "site:tiktok.com fyp song",
  "site:tiktok.com trending song this week",
];

/**
 * Run a Google search via SearchApi and return organic results + total estimate.
 * Returns null on transport failure so the caller can fail-closed.
 */
async function googleSearch(apiKey: string, q: string): Promise<{ items: any[]; total_results: number } | null> {
  const url = `${SEARCHAPI_BASE}?engine=google&q=${encodeURIComponent(q)}&num=20`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return null;
    const data = await r.json();
    return {
      items: Array.isArray(data?.organic_results) ? data.organic_results : [],
      total_results: Number(data?.search_information?.total_results) || 0,
    };
  } catch { return null; }
}

const TITLE_JUNK_RE = /(tiktok|videos?|sounds?|music|search|trending|viral|latest|see more|original sound\s*-?\s*$|^\s*-\s*$)/i;

/**
 * Parse a TikTok music page Google result into (title, artist).
 * TikTok titles look like:
 *   "Espresso - Sabrina Carpenter | TikTok"        (artist last)
 *   "Sabrina Carpenter - Espresso"                 (artist first)
 *   "Song name - original sound - username"        (UGC, skip)
 * We try a couple of heuristics and reject obviously bad rows.
 */
function parseTikTokMusicTitle(title: string, link: string): { title: string; artist: string } | null {
  if (!title) return null;
  const cleaned = title.replace(/\s*\|\s*TikTok.*$/i, "").replace(/\s+\(.*?\)\s*$/g, "").trim();
  if (!cleaned) return null;
  if (/original sound/i.test(cleaned)) return null;
  const parts = cleaned.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Heuristic: tiktok music slug usually ends with the music_id; the page <title>
  // is "<song> - <artist>". Apple/Spotify style is "<artist> - <song>". Without a
  // robust signal we default to "<song> - <artist>" because that's what tiktok.com
  // /music pages render. Reject either side that's pure junk.
  const [a, b] = [parts[0], parts.slice(1).join(" - ")];
  if (a.length > 120 || b.length > 120) return null;
  if (TITLE_JUNK_RE.test(a) || TITLE_JUNK_RE.test(b)) return null;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return null;
  return { title: a, artist: b };
}

function extractCreatorFromTikTokUrl(link: string): string | null {
  const m = String(link || "").match(/tiktok\.com\/@([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolve which side of a "<A> - <B>" parse is title vs artist by querying
 * MusicBrainz both ways and keeping the orientation that yields the better
 * (higher-scored) recording match. Falls back to the original orientation
 * when MusicBrainz returns nothing for either.
 */
async function normalizeTitleArtist(a: string, b: string): Promise<{ title: string; artist: string }> {
  async function probe(title: string, artist: string): Promise<number> {
    try {
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`)}&fmt=json&limit=1`;
      const r = await fetch(url, { headers: { "User-Agent": "Publisting/1.0 (a&r-tool)" } });
      if (!r.ok) return 0;
      const data = await r.json();
      const top = data?.recordings?.[0];
      return Number(top?.score) || 0;
    } catch { return 0; }
  }
  const [orig, swapped] = await Promise.all([probe(a, b), probe(b, a)]);
  if (orig === 0 && swapped === 0) return { title: a, artist: b };
  return swapped > orig ? { title: b, artist: a } : { title: a, artist: b };
}

/**
 * Discover trending TikTok tracks via Google's index of tiktok.com/music pages.
 * Aggregates by (title, artist) across multiple seed queries; tracks observed
 * across more seeds and with more linked /@user/ creators rank highest.
 */
async function discoverTrendingTracks(apiKey: string): Promise<DiscoveredTrack[]> {
  const agg = new Map<string, DiscoveredTrack & { _creators: Set<string>; _seeds: Set<string> }>();
  const results = await Promise.all(DISCOVERY_SEEDS.map(async (q) => ({ q, res: await googleSearch(apiKey, q) })));
  for (const { q, res } of results) {
    if (!res) continue;
    for (const item of res.items) {
      const link = String(item?.link || "");
      const isMusicPage = /tiktok\.com\/music\//i.test(link);
      const parsed = parseTikTokMusicTitle(item?.title || "", link);
      if (!isMusicPage || !parsed) continue;
      const key = `${parsed.title.toLowerCase()}||${parsed.artist.toLowerCase()}`;
      const cur = agg.get(key) || {
        title: parsed.title, artist: parsed.artist, music_id: null,
        total_views: 0, video_count: 0, unique_creators: 0,
        _creators: new Set<string>(), _seeds: new Set<string>(),
      };
      cur._seeds.add(q);
      const creator = extractCreatorFromTikTokUrl(link);
      if (creator) cur._creators.add(creator);
      agg.set(key, cur);
    }
  }
  return Array.from(agg.values())
    .map((t) => ({
      title: t.title, artist: t.artist, music_id: null,
      total_views: 0, video_count: t._seeds.size, unique_creators: t._creators.size,
    }))
    // Prefer tracks that surfaced in multiple discovery seeds first.
    .sort((a, b) => (b.video_count * 5 + b.unique_creators) - (a.video_count * 5 + a.unique_creators));
}

/**
 * Fetch TikTok signals for a known track by searching Google for tiktok.com
 * pages mentioning the track. video_count = organic results, unique_creators
 * = distinct @handles across those results, total_views = Google's reported
 * total result estimate (a coarse popularity proxy).
 */
async function fetchTikTokSignals(apiKey: string, query: string): Promise<TikTokSignals | null> {
  const res = await googleSearch(apiKey, `${query} site:tiktok.com`);
  if (!res) return null;
  if (!res.items.length) {
    return { video_count: 0, unique_creators: 0, total_views: 0, total_likes: 0, top_creators: [] };
  }
  const creators = new Map<string, { url: string; title: string }>();
  for (const item of res.items) {
    const handle = extractCreatorFromTikTokUrl(item?.link || "");
    if (handle && !creators.has(handle)) {
      creators.set(handle, { url: String(item?.link || ""), title: String(item?.title || "") });
    }
  }
  const top = Array.from(creators.entries()).slice(0, 6).map(([username, m]) => ({
    username, views: null as number | null, likes: null as number | null, url: m.url,
  }));
  return {
    video_count: res.items.length,
    unique_creators: creators.size,
    total_views: res.total_results, // Google estimate, NOT actual TikTok plays
    total_likes: 0, // not available via Google
    top_creators: top,
  };
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
  // Ceilings tuned for Google-as-proxy: video_count is # of organic tiktok.com
  // hits (capped near 20), unique_creators is distinct @handles among them,
  // total_views uses Google's total_results estimate (can reach billions).
  const videoComponent = logScale(current.video_count, 25);
  const creatorComponent = logScale(current.unique_creators, 20);
  const viewsComponent = logScale(current.total_views, 1_000_000_000);
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