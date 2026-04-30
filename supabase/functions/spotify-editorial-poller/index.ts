// Polls tracked Spotify editorial playlists and writes per-track positions
// into playlist_placements_history (one snapshot per playlist per day).
//
// Body (optional): { playlist_ids?: string[], limit?: number }
// - If playlist_ids provided, only those are polled.
// - Otherwise, every enabled row in tracked_playlists (platform='spotify') is polled.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOKEN_URL = "https://accounts.spotify.com/api/token";

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

function trackKey(title: string, artist: string) {
  return `${(title || "").toLowerCase().trim()}::${(artist || "").toLowerCase().trim()}`;
}

async function fetchPlaylistMeta(token: string, playlistId: string) {
  const r = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,owner(display_name),followers(total)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) return null;
  return r.json();
}

async function fetchPlaylistTracks(token: string, playlistId: string, max = 100) {
  const all: any[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(name),external_ids(isrc),external_urls(spotify))),next&limit=100`;
  while (url && all.length < max) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) break;
    const data: any = await r.json();
    for (const item of data?.items || []) {
      if (item?.track) all.push(item.track);
    }
    url = data?.next ?? null;
  }
  return all.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SP_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
    const SP_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Missing supabase env" }, 500);
    if (!SP_ID || !SP_SECRET) return json({ error: "Missing Spotify credentials" }, 500);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const explicitIds: string[] | undefined = Array.isArray(body?.playlist_ids) ? body.playlist_ids : undefined;
    const trackLimit = Math.min(Number(body?.limit) || 100, 200);

    // Resolve playlists
    let playlists: { playlist_id: string; playlist_name: string; owner_name: string | null }[] = [];
    if (explicitIds && explicitIds.length) {
      playlists = explicitIds.map((id) => ({ playlist_id: id, playlist_name: id, owner_name: null }));
    } else {
      const { data } = await sb
        .from("tracked_playlists")
        .select("playlist_id, playlist_name, owner_name")
        .eq("platform", "spotify").eq("enabled", true);
      playlists = (data || []) as any[];
    }
    if (playlists.length === 0) return json({ ok: true, processed: 0, message: "No tracked playlists" });

    const token = await getAppToken(SP_ID, SP_SECRET);
    if (!token) return json({ error: "Failed to acquire Spotify token" }, 502);

    let processed = 0;
    let inserted = 0;
    const errors: any[] = [];

    for (const pl of playlists) {
      try {
        const meta = await fetchPlaylistMeta(token, pl.playlist_id);
        const playlistName = meta?.name || pl.playlist_name;
        const ownerName = meta?.owner?.display_name || pl.owner_name || null;
        const followers = meta?.followers?.total ?? null;

        const tracks = await fetchPlaylistTracks(token, pl.playlist_id, trackLimit);
        if (tracks.length === 0) { processed++; continue; }

        const rows = tracks.map((t: any, idx: number) => {
          const title = t?.name ?? "";
          const primaryArtist = t?.artists?.[0]?.name ?? "";
          return {
            platform: "spotify",
            playlist_id: pl.playlist_id,
            playlist_name: playlistName,
            owner_name: ownerName,
            follower_count: followers,
            position: idx + 1,
            track_key: trackKey(title, primaryArtist),
            isrc: t?.external_ids?.isrc ?? null,
            source_url: t?.external_urls?.spotify ?? null,
            raw: {
              spotify_track_id: t?.id ?? null,
              title,
              all_artists: (t?.artists || []).map((a: any) => a?.name).filter(Boolean),
            },
          };
        }).filter((r: any) => r.track_key && r.track_key !== "::");

        // Upsert on (platform, playlist_id, captured_on, track_key)
        const { error: upErr, count } = await sb
          .from("playlist_placements_history")
          .upsert(rows as any, { onConflict: "platform,playlist_id,captured_on,track_key", count: "exact" });
        if (upErr) errors.push({ playlist: pl.playlist_id, error: upErr.message });
        else inserted += rows.length;

        // Update last_polled_at
        await sb.from("tracked_playlists")
          .update({ last_polled_at: new Date().toISOString() } as any)
          .eq("platform", "spotify").eq("playlist_id", pl.playlist_id);

        processed++;
      } catch (e: any) {
        errors.push({ playlist: pl.playlist_id, error: e?.message || String(e) });
      }
    }

    return json({ ok: true, processed, tracks_written: inserted, errors });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});