// Soundcharts song-level fetch: metadata + playlists + chart positions + radio airplay.
// Workspace-wide credentials (SOUNDCHARTS_APP_ID + SOUNDCHARTS_API_KEY).
// Caches results in soundcharts_song_data per (user_id, title, artist) for 7 days.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SC_BASE = "https://customer.api.soundcharts.com";

interface SongFetchPayload {
  song_title: string;
  song_artist?: string;
  isrc?: string;
  spotify_id?: string;
  force_refresh?: boolean;
  test_only?: boolean;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getCreds(): { appId: string; apiKey: string } | null {
  const appId = Deno.env.get("SOUNDCHARTS_APP_ID");
  const rawKey = Deno.env.get("SOUNDCHARTS_API_KEY");
  if (!appId || !rawKey) return null;
  // Legacy support: SOUNDCHARTS_API_KEY may have been stored as "appId:apiKey".
  const apiKey = rawKey.includes(":") ? rawKey.split(":")[1] : rawKey;
  return { appId, apiKey };
}

async function scFetch(path: string, creds: { appId: string; apiKey: string }) {
  const res = await fetch(`${SC_BASE}${path}`, {
    headers: {
      "x-app-id": creds.appId,
      "x-api-key": creds.apiKey,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json: json as any, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const creds = getCreds();
    if (!creds) {
      return jsonResponse({
        success: false,
        error: "Soundcharts credentials not configured. Set SOUNDCHARTS_APP_ID and SOUNDCHARTS_API_KEY.",
        code: "missing_credentials",
      }, 400);
    }

    // Auth: identify caller for per-user caching + RLS-safe writes.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    let userId: string | null = null;
    if (jwt) {
      const { data: userData } = await adminClient.auth.getUser(jwt);
      userId = userData?.user?.id ?? null;
    }

    const body = (await req.json().catch(() => ({}))) as SongFetchPayload;

    // Test-only mode: just verify credentials by hitting a cheap endpoint.
    if (body.test_only) {
      const probe = await scFetch("/api/v2.9/song/search/test", creds);
      const ok = probe.status !== 401 && probe.status !== 403;
      return jsonResponse({
        success: ok,
        status: probe.status,
        error: ok ? null : `Soundcharts rejected credentials (HTTP ${probe.status}).`,
      }, ok ? 200 : 401);
    }

    if (!userId) {
      return jsonResponse({ success: false, error: "Sign in required." }, 401);
    }

    const title = (body.song_title || "").trim();
    if (!title) return jsonResponse({ success: false, error: "song_title is required." }, 400);
    const artist = (body.song_artist || "").trim();
    const isrc = (body.isrc || "").trim().toUpperCase();

    // Cache lookup.
    if (!body.force_refresh) {
      let q = adminClient
        .from("soundcharts_song_data")
        .select("*")
        .eq("user_id", userId);
      if (isrc) q = q.eq("isrc", isrc);
      else q = q.ilike("song_title", title).ilike("song_artist", artist || "%");
      const { data: cached } = await q.order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      if (cached && new Date(cached.expires_at) > new Date()) {
        return jsonResponse({ success: true, data: cached, cached: true });
      }
    }

    // 1) Resolve a Soundcharts song UUID. Prefer ISRC, then platform id, then title+artist search.
    let songUuid: string | null = null;
    let songMeta: any = null;

    if (isrc) {
      const r = await scFetch(`/api/v2.25/song/by-isrc/${encodeURIComponent(isrc)}`, creds);
      if (r.ok && r.json?.object?.uuid) {
        songUuid = r.json.object.uuid;
        songMeta = r.json.object;
      }
    }
    if (!songUuid && body.spotify_id) {
      const r = await scFetch(`/api/v2.25/song/by-platform/spotify/${encodeURIComponent(body.spotify_id)}`, creds);
      if (r.ok && r.json?.object?.uuid) {
        songUuid = r.json.object.uuid;
        songMeta = r.json.object;
      }
    }
    if (!songUuid) {
      const term = encodeURIComponent([title, artist].filter(Boolean).join(" "));
      const r = await scFetch(`/api/v2.25/song/search/${term}?limit=5`, creds);
      const items: any[] = r.json?.items || [];
      // Strict title+artist match policy: prefer items whose name and artist match (case-insensitive).
      const t = title.toLowerCase();
      const a = artist.toLowerCase();
      const exact = items.find((it) => {
        const n = (it?.name || "").toLowerCase();
        const credits = (it?.creditName || "").toLowerCase();
        const artistsMatch = !a || credits.includes(a) || (it?.artists || []).some((x: any) => (x?.name || "").toLowerCase() === a);
        return n === t && artistsMatch;
      });
      const chosen = exact || (a ? null : items[0]); // fail-closed if artist provided but no match
      if (chosen?.uuid) {
        songUuid = chosen.uuid;
        songMeta = chosen;
      }
    }

    if (!songUuid) {
      return jsonResponse({
        success: false,
        error: "Song not found on Soundcharts (strict title+artist match).",
        code: "song_not_found",
      }, 404);
    }

    // 2) Fetch song metadata + playlists + charts + airplay in parallel.
    const [metaRes, playlistsRes, chartsRes, airplayRes] = await Promise.allSettled([
      scFetch(`/api/v2.25/song/${songUuid}`, creds),
      scFetch(`/api/v2.20/song/${songUuid}/playlist/current/spotify?limit=50`, creds),
      scFetch(`/api/v2/song/${songUuid}/charts/ranks?limit=20`, creds),
      scFetch(`/api/v2/song/${songUuid}/broadcasts?period=week`, creds),
    ]);

    const pick = (r: PromiseSettledResult<any>) =>
      r.status === "fulfilled" && r.value.ok ? r.value.json : null;

    const meta = pick(metaRes)?.object || songMeta || {};
    const playlistsJson = pick(playlistsRes);
    const chartsJson = pick(chartsRes);
    const airplayJson = pick(airplayRes);

    const playlists = playlistsJson?.items || [];
    const charts = chartsJson?.items || [];
    const airplayItems = airplayJson?.items || [];
    const airplaySpins = airplayItems.reduce(
      (sum: number, it: any) => sum + (Number(it?.spinCount) || 0),
      0,
    );

    const summary = {
      metadata: {
        uuid: songUuid,
        name: meta?.name || title,
        isrc: meta?.isrc || isrc || null,
        release_date: meta?.releaseDate || null,
        duration: meta?.duration || null,
        explicit: meta?.explicit ?? null,
        credit_name: meta?.creditName || null,
        artists: (meta?.artists || []).map((a: any) => ({ name: a?.name, uuid: a?.uuid })),
      },
      playlists: playlists.slice(0, 25).map((p: any) => ({
        platform: p?.platform || "spotify",
        playlist_name: p?.playlist?.name,
        playlist_uuid: p?.playlist?.uuid,
        subscribers: p?.playlist?.subscriberCount ?? null,
        position: p?.position ?? null,
        type: p?.playlist?.type || null,
        added_at: p?.entryDate || null,
      })),
      charts: charts.slice(0, 25).map((c: any) => ({
        chart_name: c?.chart?.name,
        country: c?.chart?.countryCode,
        platform: c?.chart?.platform || c?.platform,
        position: c?.position,
        peak: c?.peakPosition,
        date: c?.date,
      })),
      airplay: {
        period: "week",
        total_spins: airplaySpins,
        stations: airplayItems.slice(0, 25).map((s: any) => ({
          station: s?.broadcastingChannel?.name,
          country: s?.broadcastingChannel?.countryCode,
          spins: s?.spinCount,
        })),
      },
    };

    // Upsert into soundcharts_song_data.
    const row = {
      user_id: userId,
      song_title: title,
      song_artist: artist || null,
      isrc: summary.metadata.isrc || null,
      soundcharts_song_uuid: songUuid,
      spotify_id: body.spotify_id || null,
      metadata: summary.metadata,
      playlists: summary.playlists,
      charts: summary.charts,
      airplay: summary.airplay,
      playlist_count: summary.playlists.length,
      chart_count: summary.charts.length,
      airplay_spins: airplaySpins,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data: saved, error: saveErr } = await adminClient
      .from("soundcharts_song_data")
      .insert(row)
      .select()
      .maybeSingle();
    if (saveErr) console.error("soundcharts_song_data insert error:", saveErr);

    return jsonResponse({ success: true, data: saved || row, cached: false });
  } catch (e) {
    console.error("soundcharts-song-fetch error:", e);
    return jsonResponse({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});