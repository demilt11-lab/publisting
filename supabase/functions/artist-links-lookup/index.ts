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
    if (data && new Date(data.expires_at) > new Date()) return data.data;
    return null;
  } catch { return null; }
}

async function setCache(cacheKey: string, value: any): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from('streaming_stats_cache')
      .upsert({ cache_key: cacheKey, data: value, expires_at: expiresAt }, { onConflict: 'cache_key' });
  } catch {}
}

// Map MusicBrainz URL relationship types to platform keys
function classifyUrl(url: string): { platform: string; url: string } | null {
  const u = url.toLowerCase();
  if (u.includes('open.spotify.com/artist')) return { platform: 'spotify', url };
  if (u.includes('music.apple.com') && u.includes('artist')) return { platform: 'apple_music', url };
  if (u.includes('youtube.com/channel') || u.includes('youtube.com/@') || u.includes('youtube.com/c/')) return { platform: 'youtube', url };
  if (u.includes('music.youtube.com/channel')) return { platform: 'youtube_music', url };
  if (u.includes('tidal.com/artist') || u.includes('tidal.com/browse/artist')) return { platform: 'tidal', url };
  if (u.includes('deezer.com/artist')) return { platform: 'deezer', url };
  if (u.includes('music.amazon') && u.includes('artist')) return { platform: 'amazon_music', url };
  if (u.includes('soundcloud.com/')) return { platform: 'soundcloud', url };
  if (u.includes('pandora.com/artist')) return { platform: 'pandora', url };
  if (u.includes('audiomack.com/')) return { platform: 'audiomack', url };
  if (u.includes('bandcamp.com')) return { platform: 'bandcamp', url };
  if (u.includes('instagram.com/')) return { platform: 'instagram', url };
  if (u.includes('twitter.com/') || u.includes('x.com/')) return { platform: 'twitter', url };
  if (u.includes('tiktok.com/@')) return { platform: 'tiktok', url };
  if (u.includes('facebook.com/')) return { platform: 'facebook', url };
  if (u.includes('genius.com/artists/')) return { platform: 'genius', url };
  if (u.includes('discogs.com/artist')) return { platform: 'discogs', url };
  if (u.includes('allmusic.com/artist')) return { platform: 'allmusic', url };
  if (u.includes('wikidata.org/')) return { platform: 'wikidata', url };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mbid, artistName } = await req.json();

    if (!mbid && !artistName) {
      return new Response(
        JSON.stringify({ success: false, error: 'mbid or artistName required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `v6::artist_links_${mbid || artistName.toLowerCase().trim()}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify({ success: true, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resolvedMbid = mbid;

    // If no MBID, search for the artist first
    if (!resolvedMbid && artistName) {
      await delay(1100);
      const searchRes = await fetch(
        `${MB_BASE}/artist?query=artist:"${encodeURIComponent(artistName)}"&fmt=json&limit=3`,
        { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const match = (searchData.artists || []).find((a: any) =>
          a.name.toLowerCase() === artistName.toLowerCase() || a.score >= 90
        );
        if (match) resolvedMbid = match.id;
      }
    }

    if (!resolvedMbid) {
      const emptyResult = { links: {} };
      await setCache(cacheKey, emptyResult);
      return new Response(
        JSON.stringify({ success: true, data: emptyResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch artist with URL relationships
    await delay(1100);
    const artistRes = await fetch(
      `${MB_BASE}/artist/${resolvedMbid}?inc=url-rels&fmt=json`,
      { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
    );

    if (!artistRes.ok) {
      throw new Error(`MusicBrainz artist fetch failed: ${artistRes.status}`);
    }

    const artistData = await artistRes.json();
    const links: Record<string, string> = {};

    for (const rel of artistData.relations || []) {
      if (rel.url?.resource) {
        const classified = classifyUrl(rel.url.resource);
        if (classified && !links[classified.platform]) {
          links[classified.platform] = classified.url;
        }
      }
    }

    // Genius verified socials override MB for instagram/twitter/facebook
    if (artistName) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && serviceKey) {
          const gRes = await fetch(`${supabaseUrl}/functions/v1/genius-artist-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ name: artistName }),
          });
          if (gRes.ok) {
            const gData = await gRes.json().catch(() => null);
            const g = gData?.data || {};
            if (g.instagram) links.instagram = g.instagram;
            if (g.twitter) links.twitter = g.twitter;
            if (g.facebook) links.facebook = g.facebook;
            if (g.genius && !links.genius) links.genius = g.genius;
          }
        }
      } catch {
        /* fail-closed: keep MB-only links */
      }
    }

    console.log(`Artist links for ${artistName || mbid}: ${Object.keys(links).length} platforms found`);

    const resultData = { links, mbid: resolvedMbid };
    await setCache(cacheKey, resultData);

    return new Response(
      JSON.stringify({ success: true, data: resultData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Artist links lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
