// Spotify verification edge function — looks up a track using the
// caller's own Spotify Client Credentials (stored in spotify_credentials).
//
// Body: { title: string, artist?: string, isrc?: string }
// Returns: { ok, candidates: [{ id, name, artists, album, isrc, duration_ms, popularity, release_date, external_url }], usedCreds: 'user' | 'shared' }

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

interface ReqBody {
  title?: string;
  artist?: string;
  isrc?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAppToken(clientId: string, clientSecret: string): Promise<string | null> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.access_token ?? null;
}

function shapeTrack(t: any) {
  return {
    id: t?.id,
    name: t?.name,
    artists: (t?.artists || []).map((a: any) => a?.name).filter(Boolean),
    album: t?.album?.name,
    release_date: t?.album?.release_date,
    isrc: t?.external_ids?.isrc,
    duration_ms: t?.duration_ms,
    popularity: t?.popularity,
    external_url: t?.external_urls?.spotify,
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

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const title = (body.title || "").trim();
    const artist = (body.artist || "").trim();
    const isrc = (body.isrc || "").trim();
    if (!title && !isrc) return json({ ok: false, error: "title or isrc required" }, 400);

    // 1) Per-user creds (preferred), fall back to shared workspace creds
    let usedCreds: "user" | "shared" = "user";
    let clientId: string | null = null;
    let clientSecret: string | null = null;

    const { data: cred } = await supa
      .from("spotify_credentials")
      .select("client_id,client_secret")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (cred?.client_id && cred?.client_secret) {
      clientId = cred.client_id;
      clientSecret = cred.client_secret;
    } else {
      clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || null;
      clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET") || null;
      usedCreds = "shared";
    }

    if (!clientId || !clientSecret) {
      return json({ ok: false, error: "No Spotify credentials configured. Add them in Catalog Analysis → Model settings → Spotify API." }, 400);
    }

    const token = await getAppToken(clientId, clientSecret);
    if (!token) return json({ ok: false, error: "Spotify token request failed (check Client ID / Secret)." }, 502);

    // 2) ISRC search first when available, otherwise title+artist
    const queries: string[] = [];
    if (isrc) queries.push(`isrc:${isrc}`);
    if (title) queries.push(artist ? `track:"${title}" artist:"${artist}"` : `track:"${title}"`);

    let tracks: any[] = [];
    for (const q of queries) {
      const url = `${SEARCH_URL}?type=track&limit=10&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) continue;
      const data = await r.json().catch(() => null);
      const items = data?.tracks?.items || [];
      if (items.length) { tracks = items; break; }
    }

    return json({
      ok: true,
      usedCreds,
      candidates: tracks.map(shapeTrack).filter((t) => t.id),
    });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
