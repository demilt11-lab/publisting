const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    // If we have a track ID, use it directly
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

    // Search for the track
    const q = `track:${title} artist:${artist}`;
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return { popularity: null, spotifyUrl: null };

    const data = await res.json();
    const tracks = data?.tracks?.items || [];
    if (tracks.length === 0) return { popularity: null, spotifyUrl: null };

    // Find best match
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

    // Fallback to first result
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
    // Search for the music video
    const q = `${artist} ${title} official`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=3&key=${apiKey}`;
    
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.error('YouTube search failed:', searchRes.status);
      const body = await searchRes.text();
      console.error('YouTube search error body:', body);
      return { viewCount: null, youtubeUrl: null };
    }

    const searchData = await searchRes.json();
    const items = searchData?.items || [];
    if (items.length === 0) return { viewCount: null, youtubeUrl: null };

    // Find best match - prefer official music videos
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

    // Get video statistics
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

    console.log('Streaming stats for:', title, 'by', artist, 'spotifyTrackId:', spotifyTrackId);

    // Fetch both in parallel
    const [spotify, youtube] = await Promise.all([
      getSpotifyStats(title, artist, spotifyTrackId),
      getYouTubeStats(title, artist),
    ]);

    const result = {
      success: true,
      data: {
        spotify: {
          popularity: spotify.popularity,
          url: spotify.spotifyUrl,
        },
        youtube: {
          viewCount: youtube.viewCount,
          url: youtube.youtubeUrl,
        },
      },
    };

    console.log('Streaming stats result:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
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
