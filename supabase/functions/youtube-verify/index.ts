// YouTube verification edge function — searches YouTube for a song using the
// caller's own YouTube Data API v3 key (stored in youtube_credentials),
// falling back to the shared YOUTUBE_API_KEY workspace secret.
//
// Body: { title: string, artist?: string, isrc?: string, aliases?: string[] }
// Returns: { ok, candidates: [{ id, title, channelTitle, viewCount, likeCount, commentCount, publishedAt, thumbnail, url, durationIso, isrcGuess }], usedCreds: 'user'|'shared' }

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickIsrc(snippet: any, contentDetails: any): string | undefined {
  // Some uploads expose ISRC in tags or description.
  const haystack = [
    ...(snippet?.tags || []),
    snippet?.description || "",
    contentDetails?.contentRating?.ytRating || "",
  ].join(" ");
  const m = haystack.match(/\b([A-Z]{2}[A-Z0-9]{3}\d{7})\b/);
  return m?.[1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supa.auth.getUser();
    if (userErr || !userRes?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();
    const artist = String(body?.artist || "").trim();
    const isrc = String(body?.isrc || "").trim();
    const aliases: string[] = Array.isArray(body?.aliases)
      ? body.aliases.map((a: any) => String(a || "").trim()).filter(Boolean)
      : [];
    if (!title) return json({ ok: false, error: "title required" }, 400);

    let usedCreds: "user" | "shared" = "user";
    let apiKey: string | null = null;

    const { data: cred } = await supa
      .from("youtube_credentials")
      .select("api_key")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (cred?.api_key) {
      apiKey = cred.api_key;
    } else {
      apiKey = Deno.env.get("YOUTUBE_API_KEY") || null;
      usedCreds = "shared";
    }

    if (!apiKey) {
      return json({ ok: false, error: "No YouTube API key configured. Add one in Catalog Analysis → Model settings → YouTube API." }, 400);
    }

    // Build a broad set of query variants so a strict title doesn't miss the track.
    // Order matters — most specific first so good matches rank early.
    const stripParens = (s: string) => s.replace(/\s*[\(\[].*?[\)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
    const stripFeat = (s: string) => s.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+.+$/i, "").trim();
    const stripDash = (s: string) => s.replace(/\s+[-–—]\s+.+$/, "").trim();

    const titleVariants = new Set<string>([title]);
    [stripParens(title), stripFeat(title), stripDash(title), stripParens(stripFeat(title))]
      .forEach((t) => { if (t && t.length >= 2) titleVariants.add(t); });

    const artistVariants = new Set<string>();
    if (artist) artistVariants.add(artist);
    for (const a of aliases) artistVariants.add(a);
    // First-listed artist (split on common separators) — handles "A, B & C"
    if (artist) {
      const lead = artist.split(/[,&]|feat\.?|ft\.?|featuring/i)[0]?.trim();
      if (lead) artistVariants.add(lead);
    }

    const queries = new Set<string>();
    if (isrc) queries.add(isrc); // ISRCs are sometimes in tags/descriptions
    for (const t of titleVariants) {
      for (const a of artistVariants) {
        queries.add(`${t} ${a}`);
        queries.add(`"${t}" "${a}"`);
        queries.add(`${t} - ${a}`);
        queries.add(`${a} - ${t}`);
      }
      queries.add(`${t} official audio`);
      queries.add(`${t} official music video`);
      queries.add(t);
    }

    // Cap how many queries we run to protect quota (10 search units per call).
    const queryList = [...queries].slice(0, 8);
    console.log(`YouTube search: trying ${queryList.length} variants`, queryList);

    const seenIds = new Set<string>();
    const orderedIds: string[] = [];
    let lastError: { status: number; text: string } | null = null;

    for (const q of queryList) {
      const searchRes = await fetch(`${SEARCH_URL}?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${apiKey}`);
      if (!searchRes.ok) {
        const txt = await searchRes.text().catch(() => "");
        lastError = { status: searchRes.status, text: txt.slice(0, 240) };
        // Quota exceeded → bail out immediately.
        if (searchRes.status === 403 || searchRes.status === 429) break;
        continue;
      }
      const searchData = await searchRes.json();
      for (const it of (searchData?.items || [])) {
        const vid = it?.id?.videoId;
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          orderedIds.push(vid);
        }
      }
      // Once we have enough candidates, stop spending quota on further variants.
      if (orderedIds.length >= 15) break;
    }

    const ids = orderedIds.slice(0, 25); // YouTube videos endpoint accepts up to 50 ids
    if (ids.length === 0 && lastError) {
      return json({ ok: false, error: `YouTube search failed (${lastError.status}): ${lastError.text}` }, 502);
    }

    if (ids.length === 0) return json({ ok: true, usedCreds, candidates: [] });

    const videosRes = await fetch(
      `${VIDEOS_URL}?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${apiKey}`,
    );
    if (!videosRes.ok) {
      const txt = await videosRes.text().catch(() => "");
      return json({ ok: false, error: `YouTube videos lookup failed (${videosRes.status}): ${txt.slice(0, 240)}` }, 502);
    }
    const videosData = await videosRes.json();

    const candidates = (videosData?.items || []).map((v: any) => ({
      id: v?.id,
      title: v?.snippet?.title,
      channelTitle: v?.snippet?.channelTitle,
      publishedAt: v?.snippet?.publishedAt,
      thumbnail: v?.snippet?.thumbnails?.medium?.url || v?.snippet?.thumbnails?.default?.url,
      viewCount: Number(v?.statistics?.viewCount) || 0,
      likeCount: Number(v?.statistics?.likeCount) || 0,
      commentCount: Number(v?.statistics?.commentCount) || 0,
      durationIso: v?.contentDetails?.duration,
      isrcGuess: pickIsrc(v?.snippet, v?.contentDetails),
      description: v?.snippet?.description || "",
      url: v?.id ? `https://www.youtube.com/watch?v=${v.id}` : undefined,
    })).filter((c: any) => c.id);

    return json({ ok: true, usedCreds, candidates });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
