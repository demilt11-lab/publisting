const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedUrl {
  platform: 'spotify' | 'apple' | 'tidal' | 'deezer' | 'youtube' | 'search';
  id?: string;
  url?: string;
  query?: string;
}

interface ExtractedSongInfo {
  title: string;
  artist: string;
  platform: string;
}

// Extract song info from various streaming URLs
function parseStreamingUrl(input: string): ParsedUrl {
  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    // Spotify - handles open.spotify.com/track/xxx
    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
      if (match) {
        return { platform: 'spotify', id: match[1], url: input };
      }
    }

    // Apple Music - handles music.apple.com/xx/album/xxx/xxx?i=xxx or /song/xxx
    if (hostname.includes('apple') || hostname.includes('music.apple')) {
      // Try to get track ID from 'i' parameter or from song path
      const trackId = urlObj.searchParams.get('i');
      const songMatch = urlObj.pathname.match(/\/song\/[^/]+\/(\d+)/);
      const albumTrackMatch = urlObj.pathname.match(/\/album\/[^/]+\/(\d+)/);
      return { 
        platform: 'apple', 
        id: trackId || songMatch?.[1] || albumTrackMatch?.[1], 
        url: input 
      };
    }

    // Tidal - handles tidal.com/browse/track/xxx or listen.tidal.com/track/xxx
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      if (match) {
        return { platform: 'tidal', id: match[1], url: input };
      }
    }

    // Deezer - handles deezer.com/track/xxx
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      if (match) {
        return { platform: 'deezer', id: match[1], url: input };
      }
    }

    // YouTube/YouTube Music - handles youtube.com/watch?v=xxx or youtu.be/xxx
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') || 
        (hostname.includes('youtu.be') ? urlObj.pathname.slice(1) : null);
      if (videoId) {
        return { platform: 'youtube', id: videoId, url: input };
      }
    }

    // If it's a URL but we couldn't parse it, treat as search
    return { platform: 'search', query: input };
  } catch {
    // Not a URL, treat as search query
    return { platform: 'search', query: input };
  }
}

// Fetch song info from Spotify using oEmbed API
async function fetchSpotifyInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://open.spotify.com/track/${trackId}`;
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Spotify oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    // oEmbed title format is typically "Song Name - Artist Name" or just includes both
    const title = data.title || '';
    
    // Parse "Song Name by Artist Name" format
    const byMatch = title.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return {
        title: byMatch[1].trim(),
        artist: byMatch[2].trim(),
        platform: 'spotify'
      };
    }
    
    // Alternative: use the description or provider
    return {
      title: title,
      artist: data.provider_name === 'Spotify' ? '' : data.provider_name,
      platform: 'spotify'
    };
  } catch (error) {
    console.error('Error fetching Spotify info:', error);
    return null;
  }
}

// Fetch song info from Apple Music using oEmbed API
async function fetchAppleMusicInfo(url: string): Promise<ExtractedSongInfo | null> {
  try {
    const oembedUrl = `https://music.apple.com/oembed?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Apple Music oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    // Apple Music oEmbed has title and author_name
    return {
      title: data.title || '',
      artist: data.author_name || '',
      platform: 'apple'
    };
  } catch (error) {
    console.error('Error fetching Apple Music info:', error);
    return null;
  }
}

// Fetch song info from Tidal using oEmbed API
async function fetchTidalInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://tidal.com/browse/track/${trackId}`;
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Tidal oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return {
      title: data.title || '',
      artist: data.author_name || '',
      platform: 'tidal'
    };
  } catch (error) {
    console.error('Error fetching Tidal info:', error);
    return null;
  }
}

// Fetch song info from Deezer using their public API
async function fetchDeezerInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const response = await fetch(`https://api.deezer.com/track/${trackId}`);
    if (!response.ok) {
      console.log('Deezer API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    if (data.error) return null;
    
    return {
      title: data.title || '',
      artist: data.artist?.name || '',
      platform: 'deezer'
    };
  } catch (error) {
    console.error('Error fetching Deezer info:', error);
    return null;
  }
}

// Main function to extract song info from any supported streaming link
async function extractSongFromLink(parsed: ParsedUrl): Promise<ExtractedSongInfo | null> {
  console.log('Extracting song info from:', parsed.platform, parsed.id || parsed.url);
  
  switch (parsed.platform) {
    case 'spotify':
      if (parsed.id) {
        return fetchSpotifyInfo(parsed.id);
      }
      break;
    case 'apple':
      if (parsed.url) {
        return fetchAppleMusicInfo(parsed.url);
      }
      break;
    case 'tidal':
      if (parsed.id) {
        return fetchTidalInfo(parsed.id);
      }
      break;
    case 'deezer':
      if (parsed.id) {
        return fetchDeezerInfo(parsed.id);
      }
      break;
    case 'youtube':
      // YouTube doesn't have a reliable oEmbed for music, use the URL as-is
      console.log('YouTube links not fully supported for metadata extraction');
      return null;
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, filterPros } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Song lookup for:', query);

    const parsed = parseStreamingUrl(query);
    let searchQuery = parsed.query || query;
    let extractedInfo: ExtractedSongInfo | null = null;

    // If it's a streaming link, try to extract song info
    if (parsed.platform !== 'search' && (parsed.id || parsed.url)) {
      console.log('Detected streaming link, extracting song info...');
      extractedInfo = await extractSongFromLink(parsed);
      
      if (extractedInfo && extractedInfo.title) {
        // Use extracted info for MusicBrainz search
        searchQuery = extractedInfo.artist 
          ? `${extractedInfo.artist} - ${extractedInfo.title}`
          : extractedInfo.title;
        console.log('Extracted search query:', searchQuery);
      } else {
        console.log('Could not extract info from link, using original query');
      }
    }

    // Get base URL for function calls
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Step 1: Get song info from MusicBrainz
    console.log('Calling MusicBrainz lookup...');
    const mbResponse = await fetch(`${supabaseUrl}/functions/v1/musicbrainz-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: searchQuery }),
    });

    const mbData = await mbResponse.json();
    console.log('MusicBrainz response:', mbData);

    if (!mbData.success || !mbData.data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not find song information. Try searching with "Artist - Song Title"' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const songData = mbData.data;

    // Collect all names to look up
    const allNames = [
      ...songData.artists.map((a: any) => a.name),
      ...songData.writers.map((w: any) => w.name),
    ];
    const uniqueNames = [...new Set(allNames)];

    // Step 2: Look up publishing info for all credited people
    console.log('Looking up publishing info for:', uniqueNames);
    const proResponse = await fetch(`${supabaseUrl}/functions/v1/pro-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ 
        names: uniqueNames,
        songTitle: songData.title,
        artist: songData.artists[0]?.name,
        filterPros,
      }),
    });

    const proData = await proResponse.json();
    console.log('PRO lookup response:', proData);

    // Combine results
    const credits = [];

    // Add artists
    for (const artist of songData.artists) {
      const proInfo = proData.data?.[artist.name];
      credits.push({
        name: artist.name,
        role: 'artist',
        publishingStatus: proInfo?.publisher ? 'signed' : 'unknown',
        publisher: proInfo?.publisher,
        ipi: proInfo?.ipi,
        pro: proInfo?.pro,
      });
    }

    // Add writers
    for (const writer of songData.writers) {
      const proInfo = proData.data?.[writer.name];
      // Don't duplicate if already added as artist
      if (!credits.find(c => c.name === writer.name && c.role === 'artist')) {
        credits.push({
          name: writer.name,
          role: 'writer',
          publishingStatus: proInfo?.publisher ? 'signed' : 'unknown',
          publisher: proInfo?.publisher,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
        });
      }
    }

    const result = {
      success: true,
      data: {
        song: {
          title: songData.title,
          artist: songData.artists[0]?.name || 'Unknown Artist',
          album: songData.album,
          releaseDate: songData.releaseDate,
          coverUrl: songData.coverUrl,
          mbid: songData.mbid,
        },
        credits,
        sources: proData.searched || [],
      },
    };

    console.log('Final result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in song lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup song';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
