import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

const MB_UA = 'Publisting/1.0 (admin@publisting.net)';
const MB_TOKEN = Deno.env.get('METABRAINZ_TOKEN');

function normIsrc(s?: string | null) { return (s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }
function normIswc(s?: string | null) { return (s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }
function normIpi(s?: string | null) { return (s || '').replace(/[^0-9]/g, ''); }
function normTitle(s?: string | null) {
  return (s || '').toLowerCase().normalize('NFC')
    .replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, '')
    .replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function cacheKey({ isrc, iswc, title, artist }: any) {
  if (isrc) return `isrc:${normIsrc(isrc)}`;
  if (iswc) return `iswc:${normIswc(iswc)}`;
  return `ta:${normTitle(title)}|${normTitle(artist)}`;
}

async function mb<T = any>(path: string): Promise<T | null> {
  try {
    const headers: Record<string,string> = { 'User-Agent': MB_UA, 'Accept': 'application/json' };
    if (MB_TOKEN) headers['Authorization'] = `Token ${MB_TOKEN}`;
    const r = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

async function spotifyToken(): Promise<string | null> {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID');
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!id || !secret) return null;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.access_token || null;
  } catch { return null; }
}

async function spotifyByIsrc(isrc: string, tok: string) {
  try {
    const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent('isrc:' + isrc)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.tracks?.items?.[0] || null;
  } catch { return null; }
}
async function spotifyByQuery(title: string, artist: string, tok: string) {
  try {
    const q = `track:${title} artist:${artist}`;
    const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.tracks?.items?.[0] || null;
  } catch { return null; }
}

async function resolveCanonical(input: { title?: string; artist?: string; isrc?: string; iswc?: string; spotify_track_id?: string }) {
  const sources: string[] = [];
  let canonical_title = input.title || null;
  let canonical_artist = input.artist || null;
  let isrc = normIsrc(input.isrc) || null;
  let iswc = normIswc(input.iswc) || null;
  let spotify_track_id = input.spotify_track_id || null;
  let mbid_recording: string | null = null;
  let mbid_work: string | null = null;
  const writer_ipis: any[] = [];
  const publisher_ipis: any[] = [];
  let confidence = 0;

  // 1) MusicBrainz: ISRC -> recording -> works -> writer IPIs
  if (isrc) {
    const rec = await mb<any>(`isrc/${isrc}?inc=recordings+artist-credits&fmt=json`);
    const recording = rec?.recordings?.[0];
    if (recording) {
      sources.push('musicbrainz');
      mbid_recording = recording.id || mbid_recording;
      canonical_title = canonical_title || recording.title;
      canonical_artist = canonical_artist || recording['artist-credit']?.map((a: any) => a.name).join(', ') || canonical_artist;
      confidence += 0.4;

      // Get works to find ISWC + writer IPIs
      const recDetail = await mb<any>(`recording/${recording.id}?inc=works+work-rels+artist-rels&fmt=json`);
      const work = recDetail?.relations?.find((r: any) => r.type === 'performance' && r.work)?.work;
      if (work) {
        mbid_work = work.id || mbid_work;
        if (Array.isArray(work.iswcs) && work.iswcs[0]) iswc = iswc || normIswc(work.iswcs[0]);
        const workDetail = await mb<any>(`work/${work.id}?inc=artist-rels&fmt=json`);
        for (const rel of workDetail?.relations || []) {
          const a = rel.artist;
          if (!a) continue;
          const role = rel.type;
          if (['composer', 'writer', 'lyricist', 'arranger'].includes(role)) {
            const det = await mb<any>(`artist/${a.id}?fmt=json`);
            const ipi = det?.ipis?.[0] ? normIpi(det.ipis[0]) : undefined;
            writer_ipis.push({ name: a.name, ipi: ipi || null, role });
          } else if (role === 'publisher') {
            const det = await mb<any>(`artist/${a.id}?fmt=json`);
            const ipi = det?.ipis?.[0] ? normIpi(det.ipis[0]) : undefined;
            publisher_ipis.push({ name: a.name, ipi: ipi || null, role });
          }
        }
        if (writer_ipis.length || iswc) confidence += 0.2;
      }
    }
  }

  // 2) Spotify enrichment by ISRC or query
  const tok = await spotifyToken();
  if (tok) {
    let track: any = null;
    if (isrc) track = await spotifyByIsrc(isrc, tok);
    if (!track && spotify_track_id) {
      try {
        const r = await fetch(`https://api.spotify.com/v1/tracks/${spotify_track_id}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) track = await r.json();
      } catch { /* ignore */ }
    }
    if (!track && canonical_title && canonical_artist) {
      track = await spotifyByQuery(canonical_title, canonical_artist, tok);
    }
    if (track) {
      sources.push('spotify');
      spotify_track_id = spotify_track_id || track.id || null;
      isrc = isrc || normIsrc(track.external_ids?.isrc);
      canonical_title = canonical_title || track.name || null;
      canonical_artist = canonical_artist || track.artists?.map((a: any) => a.name).join(', ') || null;
      confidence += 0.3;
    }
  }

  // Confidence ceiling
  if (confidence > 1) confidence = 1;

  return {
    canonical_title, canonical_artist,
    isrc, iswc, spotify_track_id, mbid_recording, mbid_work,
    writer_ipis, publisher_ipis, sources, confidence,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [body];
    const force = !!body.force;
    const supa = db();
    const results: any[] = [];

    for (const item of items) {
      if (!item) continue;
      const key = cacheKey(item);

      if (!force) {
        const { data: cached } = await supa
          .from('metadata_normalization')
          .select('*')
          .eq('cache_key', key)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (cached) { results.push({ key, cached: true, data: cached }); continue; }
      }

      const resolved = await resolveCanonical(item);
      const row = {
        cache_key: key,
        input_title: item.title || null,
        input_artist: item.artist || null,
        input_isrc: normIsrc(item.isrc) || null,
        input_iswc: normIswc(item.iswc) || null,
        ...resolved,
        writer_ipis: resolved.writer_ipis,
        publisher_ipis: resolved.publisher_ipis,
        sources: resolved.sources,
        raw: { input: item },
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      };
      const { data: upserted } = await supa
        .from('metadata_normalization')
        .upsert(row, { onConflict: 'cache_key' })
        .select('*')
        .maybeSingle();
      results.push({ key, cached: false, data: upserted || row });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('metadata-normalize error:', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
