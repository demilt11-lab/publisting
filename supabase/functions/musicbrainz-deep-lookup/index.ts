const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'PubCheck/1.0.0 (contact@pubcheck.app)';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mbFetch(path: string): Promise<any> {
  await delay(1100); // MusicBrainz rate limit: 1 req/sec
  const res = await fetch(`${MB_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    if (res.status === 503) {
      await delay(2000);
      const retry = await fetch(`${MB_BASE}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!retry.ok) throw new Error(`MB ${retry.status}`);
      return retry.json();
    }
    throw new Error(`MB ${res.status}`);
  }
  return res.json();
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

    // Step 1: Search recordings
    const query = encodeURIComponent(`recording:"${songTitle}" AND artist:"${artistName}"`);
    const searchData = await mbFetch(`/recording?query=${query}&fmt=json&limit=5`);
    const recordings = searchData.recordings || [];

    if (recordings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: { credits: [], isrc: null, iswc: null, label: null } }),
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

    // Step 2: Get recording relationships (producers, engineers, etc.)
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

    console.log(`MusicBrainz deep: ${credits.length} credits, isrc=${isrc}, iswc=${iswc}, label=${label}`);

    return new Response(
      JSON.stringify({ success: true, data: { credits, isrc, iswc, label } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('MusicBrainz deep lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
