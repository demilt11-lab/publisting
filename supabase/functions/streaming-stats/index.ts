import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ========== SPOTIFY ==========

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;
let anonTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
      };
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

async function getSpotifyAnonToken(): Promise<string | null> {
  if (anonTokenCache && Date.now() < anonTokenCache.expiresAt) {
    return anonTokenCache.token;
  }
  try {
    const res = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'Cookie': 'sp_t=1',
      },
    });
    if (!res.ok) {
      console.error('Spotify anon token failed:', res.status);
      return null;
    }
    // Guard against non-JSON responses (e.g. HTML error pages, 403 captcha)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      console.error('Spotify anon token returned non-JSON content-type:', contentType);
      return null;
    }
    let data: any;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error('Spotify anon token JSON parse error:', parseErr);
      return null;
    }
    const token = data.accessToken;
    if (!token) return null;
    anonTokenCache = {
      token,
      expiresAt: Date.now() + 50 * 60 * 1000, // ~50 min
    };
    return token;
  } catch (e) {
    console.error('Spotify anon token exception:', e);
    return null;
  }
}

async function getExactStreamCount(trackId: string): Promise<number | null> {
  try {
    const token = await getSpotifyAnonToken();
    if (!token) return null;

    const variables = { uri: `spotify:track:${trackId}` };
    const extensions = { persistedQuery: { version: 1, sha256Hash: 'ae85b52abb74d20a4c331d4143d4772c95f34757a435d55b8c6e9038067ba7bd' } };
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=getTrack&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.46.25.g9fc9e1be',
      },
    });

    if (!res.ok) {
      // Fallback: try non-persisted POST query
      return await getExactStreamCountFallback(trackId, token);
    }

    const data = await res.json();
    const playcount = data?.data?.trackUnion?.playcount;
    if (playcount && !isNaN(Number(playcount))) return Number(playcount);

    return null;
  } catch {
    return null;
  }
}

async function getExactStreamCountFallback(trackId: string, token: string): Promise<number | null> {
  try {
    const res = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
      },
      body: JSON.stringify({
        query: `query { trackUnion(uri: "spotify:track:${trackId}") { ... on Track { playcount } } }`,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const playcount = data?.data?.trackUnion?.playcount;
    if (playcount && !isNaN(Number(playcount))) return Number(playcount);
    return null;
  } catch {
    return null;
  }
}

interface SpotifyStats {
  popularity: number | null;
  spotifyUrl: string | null;
  streamCount: number | null;
  isExactStreamCount: boolean;
  estimatedStreams: number | null;
}

function estimateStreamsFromPopularity(popularity: number | null): number | null {
  if (!popularity || popularity <= 0) return null;
  return Math.round(1000 * Math.pow(1.115, popularity));
}

async function getSpotifyStats(title: string, artist: string, trackId?: string): Promise<SpotifyStats> {
  const empty: SpotifyStats = { popularity: null, spotifyUrl: null, streamCount: null, isExactStreamCount: false, estimatedStreams: null };

  // We need a trackId. If provided, use it directly. Otherwise, try to find one via search.
  let resolvedTrackId = trackId || null;
  let popularity: number | null = null;
  let spotifyUrl: string | null = null;

  // Try official Spotify API to get track info (popularity, URL, trackId)
  const token = await getSpotifyAccessToken();
  if (token) {
    try {
      let matchedTrack: any = null;

      if (trackId) {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) matchedTrack = await res.json();
      }

      if (!matchedTrack) {
        const q = `track:${title} artist:${artist}`;
        const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const tracks = data?.tracks?.items || [];

          if (tracks.length > 0) {
            const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

            for (const track of tracks) {
              const rTitle = (track.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
              const rArtist = (track.artists?.[0]?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
              if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
                  (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
                matchedTrack = track;
                break;
              }
            }
            if (!matchedTrack) matchedTrack = tracks[0];
          }
        }
      }

      if (matchedTrack) {
        popularity = matchedTrack.popularity ?? null;
        spotifyUrl = matchedTrack.external_urls?.spotify || null;
        resolvedTrackId = matchedTrack.id || resolvedTrackId;
      }
    } catch (e) {
      console.error('Spotify API search error:', e);
    }
  } else {
    console.log('No Spotify OAuth credentials, skipping official API. Will try pathfinder only.');
  }

  // Try exact count via Pathfinder (independent of OAuth) — retry once on failure
  let exactCount: number | null = null;
  if (resolvedTrackId) {
    exactCount = await getExactStreamCount(resolvedTrackId);
    // Retry once if first attempt failed (anon token may have expired)
    if (exactCount === null) {
      anonTokenCache = null; // invalidate cached token
      exactCount = await getExactStreamCount(resolvedTrackId);
    }
  }

  const estimated = estimateStreamsFromPopularity(popularity);

  return {
    popularity,
    spotifyUrl,
    streamCount: exactCount ?? estimated,
    isExactStreamCount: exactCount !== null,
    estimatedStreams: estimated,
  };
}

// ========== YOUTUBE ==========

interface YouTubeStats {
  viewCount: string | null;
  youtubeUrl: string | null;
}

async function getYouTubeStats(title: string, artist: string): Promise<YouTubeStats> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return { viewCount: null, youtubeUrl: null };

  try {
    // Search without videoCategoryId to avoid missing results
    const q = `${artist} ${title} official music video`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=5&key=${apiKey}`;
    
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.error('YouTube search failed:', searchRes.status);
      return { viewCount: null, youtubeUrl: null };
    }

    const searchData = await searchRes.json();
    const items = searchData?.items || [];
    if (items.length === 0) return { viewCount: null, youtubeUrl: null };

    let bestVideoId = items[0]?.id?.videoId;
    const normalTitle = title.toLowerCase();
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim();

    for (const item of items) {
      const snippet = item.snippet || {};
      const vidTitle = (snippet.title || '').toLowerCase();
      const channel = (snippet.channelTitle || '').toLowerCase();
      
      if ((vidTitle.includes(normalTitle) || vidTitle.includes(normalArtist)) &&
          (channel.includes(normalArtist) || vidTitle.includes('official'))) {
        bestVideoId = item.id?.videoId;
        break;
      }
    }

    if (!bestVideoId) return { viewCount: null, youtubeUrl: null };

    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${bestVideoId}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl);
    if (!statsRes.ok) return { viewCount: null, youtubeUrl: `https://www.youtube.com/watch?v=${bestVideoId}` };

    const statsData = await statsRes.json();
    const videoStats = statsData?.items?.[0]?.statistics;

    return {
      viewCount: videoStats?.viewCount || null,
      youtubeUrl: `https://www.youtube.com/watch?v=${bestVideoId}`,
    };
  } catch (e) {
    console.error('YouTube stats error:', e);
    return { viewCount: null, youtubeUrl: null };
  }
}

// ========== GENIUS ==========

interface GeniusStats {
  pageviews: number | null;
  geniusUrl: string | null;
}

async function getGeniusStats(title: string, artist: string): Promise<GeniusStats> {
  const token = Deno.env.get('GENIUS_TOKEN');
  if (!token) return { pageviews: null, geniusUrl: null };

  try {
    const q = `${artist} ${title}`;
    const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!searchRes.ok) return { pageviews: null, geniusUrl: null };

    const searchData = await searchRes.json();
    const hits = searchData?.response?.hits || [];
    if (hits.length === 0) return { pageviews: null, geniusUrl: null };

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let bestHit = hits[0];
    for (const hit of hits) {
      const rTitle = (hit.result?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (hit.result?.primary_artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        bestHit = hit;
        break;
      }
    }

    const songId = bestHit.result?.id;
    if (!songId) return { pageviews: null, geniusUrl: bestHit.result?.url || null };

    const songRes = await fetch(`https://api.genius.com/songs/${songId}?text_format=plain`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!songRes.ok) return { pageviews: null, geniusUrl: bestHit.result?.url || null };

    const songData = await songRes.json();
    const song = songData?.response?.song;

    return {
      pageviews: song?.stats?.pageviews || null,
      geniusUrl: song?.url || bestHit.result?.url || null,
    };
  } catch (e) {
    console.error('Genius stats error:', e);
    return { pageviews: null, geniusUrl: null };
  }
}

// ========== SHAZAM ==========

interface ShazamStats {
  shazamCount: number | null;
  shazamUrl: string | null;
}

async function getShazamStats(title: string, artist: string): Promise<ShazamStats> {
  try {
    const q = `${artist} ${title}`;
    const searchUrl = `https://www.shazam.com/services/amapi/v1/catalog/US/search?term=${encodeURIComponent(q)}&types=songs&limit=5`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!searchRes.ok) {
      console.error('Shazam search failed:', searchRes.status);
      return await getShazamStatsAlt(title, artist);
    }

    const searchData = await searchRes.json();
    const songs = searchData?.results?.songs?.data || [];
    if (songs.length === 0) return await getShazamStatsAlt(title, artist);

    return await getShazamStatsAlt(title, artist);
  } catch (e) {
    console.error('Shazam stats error:', e);
    return { shazamCount: null, shazamUrl: null };
  }
}

async function getShazamStatsAlt(title: string, artist: string): Promise<ShazamStats> {
  try {
    const q = `${artist} ${title}`;
    const searchUrl = `https://www.shazam.com/services/search/v3/en/US/web/search?query=${encodeURIComponent(q)}&numResults=5&offset=0&types=songs`;
    
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error('Shazam alt search failed:', res.status);
      return { shazamCount: null, shazamUrl: null };
    }

    const data = await res.json();
    const tracks = data?.tracks?.hits || [];
    if (tracks.length === 0) return { shazamCount: null, shazamUrl: null };

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let bestTrack = tracks[0];
    for (const track of tracks) {
      const rTitle = (track.heading?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.heading?.subtitle || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        bestTrack = track;
        break;
      }
    }

    const trackKey = bestTrack?.key;
    if (!trackKey) return { shazamCount: null, shazamUrl: bestTrack?.url || null };

    const countUrl = `https://www.shazam.com/discovery/v5/en/US/web/-/track/${trackKey}`;
    const countRes = await fetch(countUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!countRes.ok) {
      return { shazamCount: null, shazamUrl: `https://www.shazam.com/track/${trackKey}` };
    }

    const countData = await countRes.json();
    const shazamCount = countData?.shazamCount || countData?.shazam_count || null;

    return {
      shazamCount: shazamCount ? parseInt(String(shazamCount), 10) : null,
      shazamUrl: `https://www.shazam.com/track/${trackKey}`,
    };
  } catch (e) {
    console.error('Shazam alt stats error:', e);
    return { shazamCount: null, shazamUrl: null };
  }
}

// ========== HANDLER ==========

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, artist, spotifyTrackId } = await req.json();

    if (!title || !artist) {
      return new Response(
        JSON.stringify({ success: false, error: 'Title and artist are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
    const supabase = getSupabaseClient();

    // Check cache first
    const { data: cached } = await supabase
      .from('streaming_stats_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      console.log('Cache hit for:', cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: cached.data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cache miss for:', title, 'by', artist);

    // Fetch all in parallel with 12s timeout per source
    const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 12000): Promise<T> =>
      Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

    const [spotify, youtube, genius, shazam] = await Promise.all([
      withTimeout(getSpotifyStats(title, artist, spotifyTrackId), { popularity: null, spotifyUrl: null, streamCount: null, isExactStreamCount: false, estimatedStreams: null }),
      withTimeout(getYouTubeStats(title, artist), { viewCount: null, youtubeUrl: null }),
      withTimeout(getGeniusStats(title, artist), { pageviews: null, geniusUrl: null }),
      withTimeout(getShazamStats(title, artist), { shazamCount: null, shazamUrl: null }),
    ]);

    const statsData = {
      spotify: {
        popularity: spotify.popularity,
        streamCount: spotify.streamCount,
        isExactStreamCount: spotify.isExactStreamCount,
        estimatedStreams: spotify.estimatedStreams,
        url: spotify.spotifyUrl,
      },
      youtube: {
        viewCount: youtube.viewCount,
        url: youtube.youtubeUrl,
      },
      genius: {
        pageviews: genius.pageviews,
        url: genius.geniusUrl,
      },
      shazam: {
        count: shazam.shazamCount,
        url: shazam.shazamUrl,
      },
    };

    // Store in cache (upsert)
    try {
      await supabase
        .from('streaming_stats_cache')
        .upsert({
          cache_key: cacheKey,
          data: statsData,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'cache_key' });
    } catch (cacheErr) {
      console.error('Cache upsert error:', cacheErr);
    }

    console.log('Cached streaming stats for:', cacheKey);

    return new Response(JSON.stringify({ success: true, data: statsData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Streaming stats error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch streaming stats' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
