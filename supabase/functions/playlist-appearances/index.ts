import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songTitle, artist } = await req.json();
    if (!songTitle || !artist) {
      return new Response(JSON.stringify({ success: false, error: 'songTitle and artist are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search for curated playlist appearances
    const queries = [
      `"${songTitle}" "${artist}" spotify editorial playlist`,
      `"${songTitle}" "${artist}" apple music curated playlist`,
    ];

    const results: { platform: string; playlistName: string; url?: string; addedDate?: string }[] = [];

    const searchPromises = queries.map(async (query) => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, limit: 5 }),
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.data || [];
      } catch {
        return [];
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Known Spotify editorial playlist patterns
    const spotifyEditorialPrefixes = [
      "Today's Top Hits", "RapCaviar", "New Music Friday", "Hot Country",
      "Viva Latino", "Are & Be", "Pop Rising", "Lorem", "Pollen",
      "Fresh Finds", "All New Indie", "mint", "Beast Mode", "Peaceful Piano",
      "Rock This", "Hot Hits", "Viral Hits", "Global Top", "Discover Weekly",
      "Release Radar", "Songs to Sing in the Car", "Chill Hits", "Mood Booster",
      "Feelin' Good", "Afternoon Acoustic", "Dance Rising", "New Pop Revolution",
    ];

    const appleMusicPlaylists = [
      "Today's Hits", "A-List Pop", "A-List Hip-Hop", "New Music Daily",
      "ALT CTRL", "R&B Now", "The Plug", "Rap Life", "Breaking Pop",
      "Future Hits", "Hits Station", "Chill Mix", "Favorites Mix",
    ];

    // Parse results for playlist mentions
    const titleLower = songTitle.toLowerCase();
    const artistLower = artist.toLowerCase();

    for (const resultSet of searchResults) {
      for (const result of resultSet) {
        const text = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`.toLowerCase();
        if (!text.includes(titleLower) && !text.includes(artistLower)) continue;

        // Check for Spotify editorial playlists
        for (const playlist of spotifyEditorialPrefixes) {
          if (text.includes(playlist.toLowerCase())) {
            if (!results.some(r => r.playlistName === playlist && r.platform === "Spotify")) {
              results.push({
                platform: "Spotify",
                playlistName: playlist,
                url: result.url,
              });
            }
          }
        }

        // Check for Apple Music playlists
        for (const playlist of appleMusicPlaylists) {
          if (text.includes(playlist.toLowerCase())) {
            if (!results.some(r => r.playlistName === playlist && r.platform === "Apple Music")) {
              results.push({
                platform: "Apple Music",
                playlistName: playlist,
                url: result.url,
              });
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        playlists: results,
        totalFound: results.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Playlist lookup error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Playlist lookup failed',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
