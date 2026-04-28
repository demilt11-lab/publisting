// DSP import — resolve a list of Spotify / Apple Music / YouTube track URLs
// into unified metadata + raw credits arrays. The client merges them through
// `normalizeCredits()` to produce the canonical writer/producer list.
//
// Body: { items: Array<{ provider: 'spotify'|'apple'|'youtube', id?: string, url: string }> }
// Returns: { ok, results: Array<{ ok, item, song?, rawCredits?, error? }> }

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Provider = "spotify" | "apple" | "youtube";
interface ImportItem { provider: Provider; id?: string; url: string }
interface RawCredit { name: string; role: string; source: Provider | "musicbrainz"; confidence?: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* ---------- MusicBrainz enrichment (by ISRC) ---------- */
async function enrichWithMusicBrainz(isrc: string | undefined, supa: any, authHeader: string): Promise<RawCredit[]> {
  if (!isrc) return [];
  try {
    const { data } = await supa.functions.invoke("musicbrainz-lookup", {
      body: { isrc },
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });
    if (data?.ok && Array.isArray(data.rawCredits)) return data.rawCredits as RawCredit[];
  } catch (e) { console.warn("musicbrainz-lookup failed", e); }
  return [];
}

async function getSpotifyToken(): Promise<string | null> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token || null;
  } catch { return null; }
}

function isoDurationToMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = Number(m[1] || 0), mi = Number(m[2] || 0), s = Number(m[3] || 0);
  return ((h * 3600) + (mi * 60) + s) * 1000;
}

/* ---------- Spotify ---------- */
async function resolveSpotify(item: ImportItem, supa: any, authHeader: string) {
  if (!item.id) return { ok: false, error: "Spotify trackId required" };
  const token = await getSpotifyToken();
  let trackMeta: any = null;
  if (token) {
    const r = await fetch(`https://api.spotify.com/v1/tracks/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (r && r.ok) trackMeta = await r.json();
  }

  // Reuse existing spotify-credits-lookup for full credit fan-out
  let credits: any = { writers: [], producers: [], performedBy: [] };
  try {
    const { data } = await supa.functions.invoke("spotify-credits-lookup", {
      body: { trackId: item.id, songTitle: trackMeta?.name, artist: trackMeta?.artists?.[0]?.name },
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });
    if (data?.success && data?.data) credits = data.data;
  } catch (e) { console.warn("spotify-credits-lookup failed", e); }

  const rawCredits: RawCredit[] = [
    ...(credits.writers || []).map((n: string) => ({ name: n, role: "writer", source: "spotify" as const })),
    ...(credits.producers || []).map((n: string) => ({ name: n, role: "producer", source: "spotify" as const })),
    ...(credits.performedBy || []).map((n: string) => ({ name: n, role: "performer", source: "spotify" as const, confidence: 0.6 })),
  ];

  return {
    ok: true,
    song: {
      title: trackMeta?.name,
      artist: trackMeta?.artists?.[0]?.name,
      isrc: trackMeta?.external_ids?.isrc,
      durationMs: trackMeta?.duration_ms,
      releaseDate: trackMeta?.album?.release_date,
      spotifyId: item.id,
      spotifyUrl: trackMeta?.external_urls?.spotify || item.url,
    },
    rawCredits,
  };
}

/* ---------- Apple ---------- */
async function resolveApple(item: ImportItem, supa: any, authHeader: string) {
  // Use existing apple-credits-lookup for credit markdown; we keep raw markdown
  // string and parse it client-side.
  let payload: any = null;
  try {
    const { data } = await supa.functions.invoke("apple-credits-lookup", {
      body: { url: item.url },
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });
    payload = data;
  } catch (e) { console.warn("apple-credits-lookup failed", e); }

  return {
    ok: true,
    song: {
      title: payload?.title,
      artist: payload?.artist,
      isrc: payload?.isrc,
      releaseDate: payload?.releaseDate,
      appleUrl: item.url,
    },
    appleMarkdown: payload?.markdown || "",
    rawCredits: [], // client merges markdown into raw via appleMarkdownToRaw
  };
}

/* ---------- YouTube ---------- */
async function resolveYoutube(item: ImportItem, supa: any, authHeader: string) {
  if (!item.id) return { ok: false, error: "YouTube videoId required" };
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return { ok: false, error: "YOUTUBE_API_KEY not configured" };

  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${item.id}&key=${apiKey}`,
    { signal: AbortSignal.timeout(8000) },
  ).catch(() => null);
  if (!r || !r.ok) return { ok: false, error: `YouTube videos lookup failed (${r?.status ?? "no-resp"})` };
  const data = await r.json();
  const v = data?.items?.[0];
  if (!v) return { ok: false, error: "Video not found" };

  // Try to extract ISRC from description / tags
  const haystack = [(v.snippet?.tags || []).join(" "), v.snippet?.description || ""].join(" ");
  const isrcMatch = haystack.match(/\b([A-Z]{2}[A-Z0-9]{3}\d{7})\b/);

  return {
    ok: true,
    song: {
      title: v.snippet?.title,
      artist: v.snippet?.channelTitle,
      isrc: isrcMatch?.[1],
      durationMs: isoDurationToMs(v.contentDetails?.duration),
      releaseDate: (v.snippet?.publishedAt || "").slice(0, 10),
      youtubeViews: Number(v.statistics?.viewCount) || 0,
      youtubeId: v.id,
      youtubeUrl: `https://www.youtube.com/watch?v=${v.id}`,
    },
    youtubeDescription: v.snippet?.description || "",
    rawCredits: [],
  };
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
    const items: ImportItem[] = Array.isArray(body?.items) ? body.items.slice(0, 25) : [];
    if (!items.length) return json({ ok: false, error: "items[] required (max 25)" }, 400);

    const results = await Promise.all(items.map(async (item) => {
      try {
        let resolved: any;
        if (item.provider === "spotify") resolved = await resolveSpotify(item, supa, authHeader);
        else if (item.provider === "apple") resolved = await resolveApple(item, supa, authHeader);
        else if (item.provider === "youtube") resolved = await resolveYoutube(item, supa, authHeader);
        else return { item, ok: false, error: `Unsupported provider: ${item.provider}` };

        if (resolved?.ok && resolved.song?.isrc) {
          const mbCredits = await enrichWithMusicBrainz(resolved.song.isrc, supa, authHeader);
          if (mbCredits.length) {
            resolved.rawCredits = [...(resolved.rawCredits || []), ...mbCredits];
          }
        }
        return { item, ...resolved };
      } catch (e) {
        return { item, ok: false, error: String((e as any)?.message || e) };
      }
    }));

    return json({ ok: true, results });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
