const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract song info from various streaming URLs
function parseStreamingUrl(url: string): { platform: string; id?: string; query?: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Spotify
    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
      return { platform: 'spotify', id: match?.[1] };
    }

    // Apple Music
    if (hostname.includes('apple') || hostname.includes('music.apple')) {
      const match = urlObj.pathname.match(/\/(\d+)\??/);
      return { platform: 'apple', id: match?.[1] };
    }

    // Tidal
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      return { platform: 'tidal', id: match?.[1] };
    }

    // Deezer
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      return { platform: 'deezer', id: match?.[1] };
    }

    // YouTube Music
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
      return { platform: 'youtube', id: videoId };
    }

    return null;
  } catch {
    // Not a URL, treat as search query
    return { platform: 'search', query: url };
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
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Song lookup for:', query);

    const parsed = parseStreamingUrl(query);
    const searchQuery = parsed?.query || query;

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
