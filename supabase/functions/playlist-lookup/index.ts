const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  trackNumber: number;
  duration?: string;
  albumName?: string;
  coverUrl?: string;
}

interface PlaylistInfo {
  name: string;
  creator: string;
  description?: string;
  coverUrl?: string;
  tracks: PlaylistTrack[];
  platform: string;
  totalTracks: number;
}

interface ParsedPlaylistUrl {
  platform: 'spotify' | 'apple' | 'deezer' | 'tidal';
  playlistId: string;
  url: string;
}

// Check if URL is a playlist link
function parsePlaylistUrl(input: string): ParsedPlaylistUrl | null {
  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    // Spotify playlist - open.spotify.com/playlist/xxx
    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/);
      if (match) {
        return { platform: 'spotify', playlistId: match[1], url: input };
      }
    }

    // Apple Music playlist - music.apple.com/xx/playlist/xxx/pl.xxx
    if (hostname.includes('apple') || hostname.includes('music.apple')) {
      const playlistMatch = urlObj.pathname.match(/\/playlist\/[^/]+\/(pl\.[a-zA-Z0-9]+)/);
      if (playlistMatch) {
        return { platform: 'apple', playlistId: playlistMatch[1], url: input };
      }
    }

    // Deezer playlist - deezer.com/playlist/xxx
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/playlist\/(\d+)/);
      if (match) {
        return { platform: 'deezer', playlistId: match[1], url: input };
      }
    }

    // Tidal playlist - tidal.com/browse/playlist/xxx
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/playlist\/([a-zA-Z0-9-]+)/);
      if (match) {
        return { platform: 'tidal', playlistId: match[1], url: input };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Format duration from seconds to mm:ss
function formatDuration(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Fetch Spotify playlist using embed data
async function fetchSpotifyPlaylist(playlistId: string): Promise<PlaylistInfo | null> {
  try {
    // Try oEmbed first for basic info
    const url = `https://open.spotify.com/playlist/${playlistId}`;
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Spotify oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Spotify oEmbed doesn't give track list, but we can try the embed page
    // For now, return basic info and indicate tracks aren't available
    return {
      name: data.title || 'Unknown Playlist',
      creator: 'Spotify User',
      coverUrl: data.thumbnail_url,
      platform: 'spotify',
      tracks: [],
      totalTracks: 0,
    };
  } catch (error) {
    console.error('Error fetching Spotify playlist:', error);
    return null;
  }
}

// Fetch Apple Music playlist - curated playlists have public API access
async function fetchAppleMusicPlaylist(playlistId: string, url: string): Promise<PlaylistInfo | null> {
  try {
    // Apple Music curated playlists can be accessed via the catalog API
    // Extract the storefront (country code) from the URL
    const urlObj = new URL(url);
    const storefrontMatch = urlObj.pathname.match(/\/([a-z]{2})\/playlist/);
    const storefront = storefrontMatch?.[1] || 'us';
    
    // For curated playlists (pl.xxx), we can try the iTunes API
    // However, the public API is limited. Let's try a workaround using the web page
    const oembedUrl = `https://music.apple.com/oembed?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Apple Music oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    return {
      name: data.title || 'Unknown Playlist',
      creator: data.author_name || 'Apple Music',
      coverUrl: data.thumbnail_url,
      platform: 'apple',
      tracks: [],
      totalTracks: 0,
    };
  } catch (error) {
    console.error('Error fetching Apple Music playlist:', error);
    return null;
  }
}

// Fetch Deezer playlist using their public API
async function fetchDeezerPlaylist(playlistId: string): Promise<PlaylistInfo | null> {
  try {
    const response = await fetch(`https://api.deezer.com/playlist/${playlistId}`);
    if (!response.ok) {
      console.log('Deezer API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    if (data.error) return null;
    
    const tracks: PlaylistTrack[] = (data.tracks?.data || []).map((track: any, index: number) => ({
      id: track.id?.toString() || `deezer-${index}`,
      title: track.title || 'Unknown Track',
      artist: track.artist?.name || 'Unknown Artist',
      trackNumber: index + 1,
      duration: formatDuration(track.duration),
      albumName: track.album?.title,
      coverUrl: track.album?.cover_small,
    }));
    
    return {
      name: data.title || 'Unknown Playlist',
      creator: data.creator?.name || 'Unknown',
      description: data.description,
      coverUrl: data.picture_medium || data.picture,
      platform: 'deezer',
      tracks,
      totalTracks: data.nb_tracks || tracks.length,
    };
  } catch (error) {
    console.error('Error fetching Deezer playlist:', error);
    return null;
  }
}

// Fetch Tidal playlist using oEmbed
async function fetchTidalPlaylist(playlistId: string): Promise<PlaylistInfo | null> {
  try {
    const url = `https://tidal.com/browse/playlist/${playlistId}`;
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Tidal oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    return {
      name: data.title || 'Unknown Playlist',
      creator: data.author_name || 'Tidal User',
      coverUrl: data.thumbnail_url,
      platform: 'tidal',
      tracks: [],
      totalTracks: 0,
    };
  } catch (error) {
    console.error('Error fetching Tidal playlist:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, isPlaylist: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking for playlist:', query);

    const parsed = parsePlaylistUrl(query);
    
    if (!parsed) {
      return new Response(
        JSON.stringify({ success: true, isPlaylist: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Detected playlist link:', parsed.platform, parsed.playlistId);

    let playlist: PlaylistInfo | null = null;

    switch (parsed.platform) {
      case 'spotify':
        playlist = await fetchSpotifyPlaylist(parsed.playlistId);
        break;
      case 'apple':
        playlist = await fetchAppleMusicPlaylist(parsed.playlistId, parsed.url);
        break;
      case 'deezer':
        playlist = await fetchDeezerPlaylist(parsed.playlistId);
        break;
      case 'tidal':
        playlist = await fetchTidalPlaylist(parsed.playlistId);
        break;
    }

    if (!playlist) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          isPlaylist: true, 
          error: 'Could not fetch playlist information' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we got tracks
    const hasFullTrackList = playlist.tracks.length > 0;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        isPlaylist: true, 
        playlist,
        hasFullTrackList,
        message: !hasFullTrackList 
          ? `${playlist.platform.charAt(0).toUpperCase() + playlist.platform.slice(1)} playlist detected. Track listing requires direct API access. For full track listing, try Deezer playlists.`
          : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in playlist lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup playlist';
    return new Response(
      JSON.stringify({ success: false, isPlaylist: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
