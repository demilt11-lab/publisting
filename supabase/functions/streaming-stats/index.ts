import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ========== SPOTIFY ==========

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

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

interface SpotifyStats {
  popularity: number | null;
  spotifyUrl: string | null;
}

async function getSpotifyStats(title: string, artist: string, trackId?: string): Promise<SpotifyStats> {
  const token = await getSpotifyAccessToken();
  if (!token) return { popularity: null, spotifyUrl: null };

  try {
    if (trackId) {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          popularity: data.popularity ?? null,
          spotifyUrl: data.external_urls?.spotify || null,
        };
      }
    }

    const q = `track:${title} artist:${artist}`;
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return { popularity: null, spotifyUrl: null };

    const data = await res.json();
    const tracks = data?.tracks?.items || [];
    if (tracks.length === 0) return { popularity: null, spotifyUrl: null };

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    for (const track of tracks) {
      const rTitle = (track.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.artists?.[0]?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        return {
          popularity: track.popularity ?? null,
          spotifyUrl: track.external_urls?.spotify || null,
        };
      }
    }

    return {
      popularity: tracks[0].popularity ?? null,
      spotifyUrl: tracks[0].external_urls?.spotify || null,
    };
  } catch (e) {
    console.error('Spotify stats error:', e);
    return { popularity: null, spotifyUrl: null };
  }
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
    const q = `${artist} ${title} official`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=3&key=${apiKey}`;
    
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

    // Find best match
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

    // Get song details with stats
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
    // Search for the track on Shazam
    const q = `${artist} ${title}`;
    const searchUrl = `https://www.shazam.com/services/amapi/v1/catalog/US/search?term=${encodeURIComponent(q)}&types=songs&limit=5`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!searchRes.ok) {
      console.error('Shazam search failed:', searchRes.status);
      // Try alternative Shazam search endpoint
      return await getShazamStatsAlt(title, artist);
    }

    const searchData = await searchRes.json();
    const songs = searchData?.results?.songs?.data || [];
    if (songs.length === 0) return await getShazamStatsAlt(title, artist);

    // Use the first match and try to get Shazam count via the discovery endpoint
    const songName = songs[0]?.attributes?.name || '';
    const artistName = songs[0]?.attributes?.artistName || '';
    
    // Try the Shazam web search to find the track key
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

    // Get the track count from Shazam's count endpoint
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

    // Fetch all in parallel
    const [spotify, youtube, genius, shazam] = await Promise.all([
      getSpotifyStats(title, artist, spotifyTrackId),
      getYouTubeStats(title, artist),
      getGeniusStats(title, artist),
      getShazamStats(title, artist),
    ]);

    const statsData = {
      spotify: {
        popularity: spotify.popularity,
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
    await supabase
      .from('streaming_stats_cache')
      .upsert({
        cache_key: cacheKey,
        data: statsData,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' });

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
