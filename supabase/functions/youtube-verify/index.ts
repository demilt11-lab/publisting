// YouTube verification edge function — searches YouTube for a song using the
// caller's own YouTube Data API v3 key (stored in youtube_credentials),
// falling back to the shared YOUTUBE_API_KEY workspace secret.
//
// Body: { title: string, artist?: string }
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

    const q = encodeURIComponent([title, artist].filter(Boolean).join(" "));
    const searchRes = await fetch(`${SEARCH_URL}?part=snippet&type=video&maxResults=10&q=${q}&key=${apiKey}`);
    if (!searchRes.ok) {
      const txt = await searchRes.text().catch(() => "");
      return json({ ok: false, error: `YouTube search failed (${searchRes.status}): ${txt.slice(0, 240)}` }, 502);
    }
    const searchData = await searchRes.json();
    const ids: string[] = (searchData?.items || [])
      .map((it: any) => it?.id?.videoId)
      .filter(Boolean);

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
      url: v?.id ? `https://www.youtube.com/watch?v=${v.id}` : undefined,
    })).filter((c: any) => c.id);

    return json({ ok: true, usedCreds, candidates });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
