import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

interface NormInput {
  // Any one of these is enough
  spotify_track_id?: string;
  isrc?: string;
  url?: string;
  title?: string;
  artist?: string;
}

interface CanonicalRow {
  spotify_track_id: string;
  isrc: string | null;
  canonical_title: string | null;
  canonical_artist: string | null;
  apple_track_id: string | null;
  apple_url: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  deezer_track_id: string | null;
  deezer_url: string | null;
  tidal_track_id: string | null;
  tidal_url: string | null;
  amazon_url: string | null;
  soundcloud_url: string | null;
  pandora_url: string | null;
  page_url: string | null;
  source: string;
  raw: Record<string, unknown>;
}

const PATTERNS = {
  spotify: /open\.spotify\.com\/(?:[a-z-]+\/)?track\/([a-zA-Z0-9]{10,32})/i,
  apple: /music\.apple\.com\/.+?(?:[?&]i=|\/song\/[^/]+\/)(\d+)/i,
  youtube: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i,
  deezer: /deezer\.com\/(?:[a-z-]+\/)?track\/(\d+)/i,
  tidal: /tidal\.com\/(?:browse\/)?track\/(\d+)/i,
};

function extractIdFromUrl(provider: keyof typeof PATTERNS, url?: string): string | null {
  if (!url) return null;
  const m = url.match(PATTERNS[provider]);
  return m?.[1] || null;
}

async function odesli(query: string): Promise<any | null> {
  try {
    const r = await fetch(`https://api.song.link/v1-alpha.1/links?${query}&userCountry=US`, {
      headers: { 'User-Agent': 'Publisting/1.0' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error('odesli error', e);
    return null;
  }
}

async function spotifyToken(): Promise<string | null> {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID');
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!id || !secret) return null;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${id}:${secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.access_token || null;
  } catch { return null; }
}

async function spotifyTrackByIsrc(isrc: string, tok: string): Promise<any | null> {
  try {
    const r = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent('isrc:' + isrc)}`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d?.tracks?.items?.[0] || null;
  } catch { return null; }
}

async function spotifyTrackBySearch(title: string, artist: string, tok: string): Promise<any | null> {
  try {
    const r = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(`track:${title} artist:${artist}`)}`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d?.tracks?.items?.[0] || null;
  } catch { return null; }
}

async function spotifyTrack(trackId: string, tok: string): Promise<any | null> {
  try {
    const r = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function resolveSpotifyId(input: NormInput): Promise<{ spotify_track_id: string | null; isrc: string | null; title: string | null; artist: string | null }> {
  // Direct on input
  let spotify_track_id = input.spotify_track_id || extractIdFromUrl('spotify', input.url) || null;
  let isrc = (input.isrc || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() || null;
  let title: string | null = input.title || null;
  let artist: string | null = input.artist || null;

  const tok = await spotifyToken();

  // If Spotify id present, get its ISRC from Spotify API
  if (spotify_track_id && tok) {
    const t = await spotifyTrack(spotify_track_id, tok);
    if (t) {
      isrc = isrc || (t.external_ids?.isrc ? String(t.external_ids.isrc).toUpperCase() : null);
      title = title || t.name || null;
      artist = artist || (t.artists?.map((a: any) => a.name).join(', ') || null);
    }
    return { spotify_track_id, isrc, title, artist };
  }

  // Lookup via ISRC
  if (isrc && tok) {
    const t = await spotifyTrackByIsrc(isrc, tok);
    if (t) {
      return {
        spotify_track_id: t.id,
        isrc,
        title: title || t.name || null,
        artist: artist || (t.artists?.map((a: any) => a.name).join(', ') || null),
      };
    }
  }

  // Lookup via title+artist
  if (title && artist && tok) {
    const t = await spotifyTrackBySearch(title, artist, tok);
    if (t) {
      return {
        spotify_track_id: t.id,
        isrc: isrc || (t.external_ids?.isrc ? String(t.external_ids.isrc).toUpperCase() : null),
        title: title || t.name,
        artist: artist || (t.artists?.map((a: any) => a.name).join(', ') || null),
      };
    }
  }

  return { spotify_track_id, isrc, title, artist };
}

async function resolveCanonical(input: NormInput): Promise<CanonicalRow | null> {
  const sid = await resolveSpotifyId(input);
  if (!sid.spotify_track_id) return null;

  // Hit Odesli with the canonical Spotify URL — guarantees consistency across DSPs
  const spotifyUrl = `https://open.spotify.com/track/${sid.spotify_track_id}`;
  const data = await odesli(`url=${encodeURIComponent(spotifyUrl)}`);
  const linksByPlatform = data?.linksByPlatform || {};
  const get = (k: string): string | null => linksByPlatform[k]?.url || null;

  const apple_url = get('appleMusic');
  const youtube_url = get('youtube') || get('youtubeMusic');
  const deezer_url = get('deezer');
  const tidal_url = get('tidal');
  const amazon_url = get('amazonMusic') || get('amazonStore');
  const soundcloud_url = get('soundcloud');
  const pandora_url = get('pandora');

  const apple_track_id = extractIdFromUrl('apple', apple_url || undefined);
  const youtube_video_id = extractIdFromUrl('youtube', youtube_url || undefined);
  const deezer_track_id = extractIdFromUrl('deezer', deezer_url || undefined);
  const tidal_track_id = extractIdFromUrl('tidal', tidal_url || undefined);

  return {
    spotify_track_id: sid.spotify_track_id,
    isrc: sid.isrc,
    canonical_title: sid.title,
    canonical_artist: sid.artist,
    apple_track_id,
    apple_url,
    youtube_video_id,
    youtube_url,
    deezer_track_id,
    deezer_url,
    tidal_track_id,
    tidal_url,
    amazon_url,
    soundcloud_url,
    pandora_url,
    page_url: data?.pageUrl || null,
    source: 'odesli',
    raw: { input, odesli: data ? { entityUniqueId: data.entityUniqueId } : null },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const items: NormInput[] = Array.isArray(body.items) ? body.items : [body];
    const force = !!body.force;
    const supa = db();
    const results: Array<{ key: string; cached: boolean; data: CanonicalRow | null; error?: string }> = [];

    for (const input of items) {
      if (!input) { results.push({ key: '', cached: false, data: null, error: 'empty input' }); continue; }

      // Cache lookup if we already know the Spotify ID
      const directSpotify = input.spotify_track_id || extractIdFromUrl('spotify', input.url);
      if (!force && directSpotify) {
        const { data: cached } = await supa
          .from('dsp_canonical_ids')
          .select('*')
          .eq('spotify_track_id', directSpotify)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (cached) { results.push({ key: directSpotify, cached: true, data: cached as CanonicalRow }); continue; }
      }

      const resolved = await resolveCanonical(input);
      if (!resolved) {
        results.push({ key: '', cached: false, data: null, error: 'could not resolve Spotify ID' });
        continue;
      }

      const row = {
        ...resolved,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      };

      const { data: upserted, error } = await supa
        .from('dsp_canonical_ids')
        .upsert(row, { onConflict: 'spotify_track_id' })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('upsert dsp_canonical_ids:', error);
        results.push({ key: resolved.spotify_track_id, cached: false, data: resolved, error: error.message });
      } else {
        results.push({ key: resolved.spotify_track_id, cached: false, data: (upserted || row) as CanonicalRow });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('dsp-id-normalize error:', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
