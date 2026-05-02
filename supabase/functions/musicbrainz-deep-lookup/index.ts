import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Publisting/1.0.0 (contact@publisting.app)';
const CACHE_TTL_HOURS = 168; // 7 days

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function getCache(cacheKey: string): Promise<any | null> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('streaming_stats_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (data && new Date(data.expires_at) > new Date()) {
      console.log('Cache hit:', cacheKey);
      return data.data;
    }
    return null;
  } catch {
    return null;
  }
}

async function setCache(cacheKey: string, value: any): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from('streaming_stats_cache')
      .upsert(
        { cache_key: cacheKey, data: value, expires_at: expiresAt },
        { onConflict: 'cache_key' }
      );
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

async function mbFetch(path: string): Promise<any> {
  await delay(1100); // MusicBrainz rate limit: 1 req/sec
  const url = `${MB_BASE}${path}`;
  const headers = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  const maxAttempts = 3;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (res.ok) return await res.json();

      // Retry on transient upstream statuses
      if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 429) {
        lastErr = new Error(`MB ${res.status}`);
        await delay(1000 * attempt);
        continue;
      }
      throw new Error(`MB ${res.status}`);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Retry on network-level failures (connection reset, abort, dns, etc.)
      const transient = /reset by peer|connection|network|abort|timeout|os error 104|ECONNRESET|fetch failed/i.test(msg);
      if (attempt < maxAttempts && transient) {
        await delay(1000 * attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('MB fetch failed');
}

function mapRelRole(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('writer') || t.includes('lyricist') || t.includes('composer') || t === 'writer') return 'writer';
  if (t.includes('producer')) return 'producer';
  if (t.includes('mix') || t === 'mixer') return 'mixer';
  if (t.includes('engineer') || t === 'recording') return 'engineer';
  if (t.includes('arranger') || t === 'orchestrator' || t === 'instrument arranger') return 'arranger';
  if (t.includes('performer') || t === 'vocal') return 'artist';
  return t;
}

interface DeepCredit {
  name: string;
  role: string;
  mbid?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songTitle, artistName } = await req.json();

    if (!songTitle || !artistName) {
      return new Response(
        JSON.stringify({ success: false, error: 'songTitle and artistName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('MusicBrainz deep lookup:', { songTitle, artistName });

    // Check cache first
    const cacheKey = `mb_deep_${songTitle.toLowerCase().trim()}_${artistName.toLowerCase().trim()}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify({ success: true, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Search recordings
    const query = encodeURIComponent(`recording:"${songTitle}" AND artist:"${artistName}"`);
    const searchData = await mbFetch(`/recording?query=${query}&fmt=json&limit=5`);
    const recordings = searchData.recordings || [];

    if (recordings.length === 0) {
      const emptyResult = { credits: [], isrc: null, iswc: null, label: null };
      await setCache(cacheKey, emptyResult);
      return new Response(
        JSON.stringify({ success: true, data: emptyResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recording = recordings[0];
    const recordingId = recording.id;
    let isrc: string | null = null;
    let iswc: string | null = null;
    let label: string | null = null;

    if (recording.isrcs?.length > 0) {
      isrc = recording.isrcs[0];
    }

    const credits: DeepCredit[] = [];
    const seenNames = new Set<string>();

    // Add artists from recording
    for (const ac of recording['artist-credit'] || []) {
      const artist = ac.artist;
      if (artist && !seenNames.has(artist.name.toLowerCase())) {
        seenNames.add(artist.name.toLowerCase());
        credits.push({ name: artist.name, role: 'artist', mbid: artist.id });
      }
    }

    // Step 2: Get recording relationships
    try {
      const recDetail = await mbFetch(`/recording/${recordingId}?inc=artist-rels+work-rels&fmt=json`);

      for (const rel of recDetail.relations || []) {
        if (rel.type && rel.artist) {
          const role = mapRelRole(rel.type);
          const name = rel.artist.name;
          if (!seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            credits.push({ name, role, mbid: rel.artist.id });
          }
        }
      }

      // Step 3: Follow work relationships for composers/lyricists
      const workRels = (recDetail.relations || []).filter((r: any) => r.type === 'performance' && r.work);
      for (const wr of workRels.slice(0, 2)) {
        try {
          const workDetail = await mbFetch(`/work/${wr.work.id}?inc=artist-rels&fmt=json`);
          if (workDetail.iswcs?.length > 0) {
            iswc = workDetail.iswcs[0];
          }
          for (const rel of workDetail.relations || []) {
            if (rel.artist) {
              const role = mapRelRole(rel.type || 'writer');
              const name = rel.artist.name;
              if (!seenNames.has(name.toLowerCase())) {
                seenNames.add(name.toLowerCase());
                credits.push({ name, role, mbid: rel.artist.id });
              }
            }
          }
        } catch (e) {
          console.warn('Work detail fetch failed:', e);
        }
      }
    } catch (e) {
      console.warn('Recording detail fetch failed:', e);
    }

    // Step 4: Get label from release
    try {
      const releases = await mbFetch(`/recording/${recordingId}?inc=releases&fmt=json`);
      const release = releases.releases?.[0];
      if (release?.id) {
        const releaseDetail = await mbFetch(`/release/${release.id}?inc=labels&fmt=json`);
        const labelInfo = releaseDetail['label-info']?.[0]?.label;
        if (labelInfo) {
          label = labelInfo.name;
        }
      }
    } catch (e) {
      console.warn('Label fetch failed:', e);
    }

    const resultData = { credits, isrc, iswc, label };
    console.log(`MusicBrainz deep: ${credits.length} credits, isrc=${isrc}, iswc=${iswc}, label=${label}`);

    // Write to cache
    await setCache(cacheKey, resultData);

    return new Response(
      JSON.stringify({ success: true, data: resultData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('MusicBrainz deep lookup error:', error);
    // Degrade gracefully: return empty data with 200 so the multi-source merge continues.
    return new Response(
      JSON.stringify({
        success: true,
        data: { credits: [], isrc: null, iswc: null, label: null },
        degraded: true,
        error: error instanceof Error ? error.message : 'Failed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
