const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface AlbumTrack {
  id: string;
  title: string;
  artist: string;
  trackNumber: number;
  duration?: string;
}

interface AlbumInfo {
  name: string;
  artist: string;
  coverUrl?: string;
  tracks: AlbumTrack[];
  platform: string;
}

interface ParsedAlbumUrl {
  platform: 'spotify' | 'apple' | 'tidal' | 'deezer';
  albumId: string;
  url: string;
}

// Check if URL is an album link and extract info
function parseAlbumUrl(input: string): ParsedAlbumUrl | null {
  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    // Spotify album - open.spotify.com/album/xxx
    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/album\/([a-zA-Z0-9]+)/);
      if (match) {
        return { platform: 'spotify', albumId: match[1], url: input };
      }
    }

    // Apple Music album - music.apple.com/xx/album/xxx/xxx (without ?i= parameter)
    if (hostname.includes('apple') || hostname.includes('music.apple')) {
      // If there's an 'i' parameter, it's a track link, not album
      if (urlObj.searchParams.get('i')) {
        return null;
      }
      const albumMatch = urlObj.pathname.match(/\/album\/[^/]+\/(\d+)/);
      if (albumMatch) {
        return { platform: 'apple', albumId: albumMatch[1], url: input };
      }
    }

    // Tidal album - tidal.com/browse/album/xxx
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/album\/(\d+)/);
      if (match) {
        return { platform: 'tidal', albumId: match[1], url: input };
      }
    }

    // Deezer album - deezer.com/album/xxx
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/album\/(\d+)/);
      if (match) {
        return { platform: 'deezer', albumId: match[1], url: input };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Format duration from ms or seconds to mm:ss
function formatDuration(ms?: number, seconds?: number): string | undefined {
  const totalSeconds = ms ? Math.floor(ms / 1000) : seconds;
  if (!totalSeconds) return undefined;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========== SPOTIFY CLIENT CREDENTIALS ==========

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
    if (!res.ok) {
      console.log('Spotify token error:', res.status);
      return null;
    }
    const data = await res.json();
    if (data.access_token) {
      spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
      };
      return data.access_token;
    }
    return null;
  } catch (e) {
    console.log('Spotify token exception:', e);
    return null;
  }
}

// Fetch Spotify album using Web API (Client Credentials)
async function fetchSpotifyAlbum(albumId: string): Promise<AlbumInfo | null> {
  try {
    const token = await getSpotifyAccessToken();
    if (token) {
      // Use Spotify Web API for full album data including tracks
      const apiUrl = `https://api.spotify.com/v1/albums/${albumId}`;
      console.log('Fetching Spotify album via Web API:', albumId);
      const apiResp = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (apiResp.ok) {
        const albumData = await apiResp.json();
        const tracks: AlbumTrack[] = (albumData.tracks?.items || []).map((track: any, index: number) => ({
          id: track.id || `spotify-${index}`,
          title: track.name || 'Unknown Track',
          artist: track.artists?.map((a: any) => a.name).join(', ') || albumData.artists?.[0]?.name || 'Unknown Artist',
          trackNumber: track.track_number || index + 1,
          duration: formatDuration(track.duration_ms),
        }));

        return {
          name: albumData.name || 'Unknown Album',
          artist: albumData.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
          coverUrl: albumData.images?.[0]?.url || albumData.images?.[1]?.url,
          platform: 'spotify',
          tracks,
        };
      } else {
        console.log('Spotify Web API album fetch failed:', apiResp.status);
      }
    }

    // Fallback to oEmbed (no tracks)
    const url = `https://open.spotify.com/album/${albumId}`;
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Spotify oEmbed failed:', response.status);
      return null;
    }
    const data = await response.json();
    
    return {
      name: data.title || 'Unknown Album',
      artist: data.provider_name === 'Spotify' ? 'Various Artists' : data.provider_name,
      coverUrl: data.thumbnail_url,
      platform: 'spotify',
      tracks: [],
    };
  } catch (error) {
    console.error('Error fetching Spotify album:', error);
    return null;
  }
}

// Fetch Apple Music album using iTunes API
async function fetchAppleMusicAlbum(albumId: string): Promise<AlbumInfo | null> {
  try {
    // iTunes lookup API is public and gives us album + tracks
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${albumId}&entity=song`
    );
    
    if (!response.ok) {
      console.log('iTunes API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    // First result is the album, rest are tracks
    const albumData = data.results[0];
    const trackData = data.results.slice(1);
    
    const tracks: AlbumTrack[] = trackData.map((track: any, index: number) => ({
      id: track.trackId?.toString() || `apple-${index}`,
      title: track.trackName || 'Unknown Track',
      artist: track.artistName || albumData.artistName,
      trackNumber: track.trackNumber || index + 1,
      duration: formatDuration(track.trackTimeMillis),
    }));
    
    return {
      name: albumData.collectionName || 'Unknown Album',
      artist: albumData.artistName || 'Unknown Artist',
      coverUrl: albumData.artworkUrl100?.replace('100x100', '300x300'),
      platform: 'apple',
      tracks,
    };
  } catch (error) {
    console.error('Error fetching Apple Music album:', error);
    return null;
  }
}

// Fetch Tidal album using oEmbed
async function fetchTidalAlbum(albumId: string): Promise<AlbumInfo | null> {
  try {
    const url = `https://tidal.com/browse/album/${albumId}`;
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Tidal oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Tidal oEmbed doesn't provide track list either
    return {
      name: data.title || 'Unknown Album',
      artist: data.author_name || 'Unknown Artist',
      coverUrl: data.thumbnail_url,
      platform: 'tidal',
      tracks: [], // Tidal oEmbed doesn't provide tracks
    };
  } catch (error) {
    console.error('Error fetching Tidal album:', error);
    return null;
  }
}

// Fetch Deezer album using their public API
async function fetchDeezerAlbum(albumId: string): Promise<AlbumInfo | null> {
  try {
    const response = await fetch(`https://api.deezer.com/album/${albumId}`);
    if (!response.ok) {
      console.log('Deezer API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    if (data.error) return null;
    
    const tracks: AlbumTrack[] = (data.tracks?.data || []).map((track: any, index: number) => ({
      id: track.id?.toString() || `deezer-${index}`,
      title: track.title || 'Unknown Track',
      artist: track.artist?.name || data.artist?.name,
      trackNumber: track.track_position || index + 1,
      duration: formatDuration(undefined, track.duration),
    }));
    
    return {
      name: data.title || 'Unknown Album',
      artist: data.artist?.name || 'Unknown Artist',
      coverUrl: data.cover_medium || data.cover,
      platform: 'deezer',
      tracks,
    };
  } catch (error) {
    console.error('Error fetching Deezer album:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0 || query.length > 1000) {
      return new Response(
        JSON.stringify({ success: false, isAlbum: false, error: 'Valid query is required (max 1000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking for album:', query);

    const parsed = parseAlbumUrl(query);
    
    if (!parsed) {
      // Not an album link
      return new Response(
        JSON.stringify({ success: true, isAlbum: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Detected album link:', parsed.platform, parsed.albumId);

    let album: AlbumInfo | null = null;

    switch (parsed.platform) {
      case 'spotify':
        album = await fetchSpotifyAlbum(parsed.albumId);
        break;
      case 'apple':
        album = await fetchAppleMusicAlbum(parsed.albumId);
        break;
      case 'tidal':
        album = await fetchTidalAlbum(parsed.albumId);
        break;
      case 'deezer':
        album = await fetchDeezerAlbum(parsed.albumId);
        break;
    }

    if (!album) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          isAlbum: true, 
          error: 'Could not fetch album information' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we got an album but no tracks (Spotify/Tidal oEmbed limitation),
    // inform the user they need to use track links directly
    if (album.tracks.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          isAlbum: true,
          album,
          message: `${album.platform === 'spotify' ? 'Spotify' : 'Tidal'} album detected but track listing not available. Please paste a direct track link instead.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, isAlbum: true, album }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in album lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup album';
    return new Response(
      JSON.stringify({ success: false, isAlbum: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
