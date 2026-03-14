import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PlaylistAppearance {
  platform: string;
  playlistName: string;
  url?: string;
  addedDate?: string;
  followers?: number;
}

async function searchFirecrawl(apiKey: string, query: string, limit = 8) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data : [];
  } catch { return []; }
}

async function extractWithAI(content: string, songTitle: string, artist: string): Promise<PlaylistAppearance[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || content.length < 40) return [];

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.1,
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: `You are a music playlist data extraction expert. Extract playlist appearances for a specific song.

Return ONLY a JSON array of objects with these fields:
- platform: string ("Spotify", "Apple Music", "Amazon Music", "YouTube Music", "Deezer", "Tidal")
- playlistName: string (exact playlist name like "Today's Top Hits", "RapCaviar", "New Music Friday", "A-List Pop")
- url: string (playlist URL if found)
- addedDate: string (date added or date mentioned, if available)
- followers: number (playlist follower count if mentioned)

RULES:
1. Only include playlists that clearly feature "${songTitle}" by "${artist}"
2. Focus on EDITORIAL/CURATED playlists (not user-generated)
3. Include both current and past playlist appearances
4. Known Spotify editorial playlists include: Today's Top Hits, RapCaviar, New Music Friday, Hot Country, Viva Latino, Are & Be, Pop Rising, Fresh Finds, All New Indie, mint, Beast Mode, Chill Hits, Mood Booster, Dance Rising, Viral Hits, Lorem, Pollen
5. Known Apple Music playlists: Today's Hits, A-List Pop, A-List Hip-Hop, New Music Daily, ALT CTRL, R&B Now, The Plug, Rap Life, Breaking Pop, Future Hits
6. Do NOT fabricate data - only extract what's in the text
7. Return empty array [] if no real playlist data is found
8. Target 10-30 playlists if data supports it

Return ONLY valid JSON array, no markdown or explanation.`
          },
          {
            role: 'user',
            content: `Extract ALL playlist appearances for "${songTitle}" by "${artist}" from this content:\n\n${content.slice(0, 15000)}`
          }
        ],
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: any) => p.platform && p.playlistName);
  } catch (e) {
    console.error('AI playlist extraction error:', e);
    return [];
  }
}

Deno.serve(async (req) => {
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
      return new Response(JSON.stringify({ success: false, error: 'Search service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Playlist appearances lookup for:', songTitle, 'by', artist);

    // Multiple diverse queries for better coverage
    const queries = [
      `"${songTitle}" "${artist}" spotify editorial playlist added`,
      `"${songTitle}" "${artist}" apple music curated playlist`,
      `"${songTitle}" "${artist}" playlist appearances editorial curated`,
      `"${songTitle}" "${artist}" "Today's Top Hits" OR "RapCaviar" OR "New Music Friday" OR "Pop Rising" OR "Hot Country"`,
      `${artist} "${songTitle}" playlist placements streaming editorial`,
    ];

    const results = await Promise.all(queries.map(q => searchFirecrawl(FIRECRAWL_API_KEY, q, 8)));

    const allContent = results
      .flat()
      .filter(Boolean)
      .map((r: any) => {
        const parts = [];
        if (r?.title) parts.push(`Title: ${r.title}`);
        if (r?.url) parts.push(`URL: ${r.url}`);
        if (r?.markdown) parts.push(r.markdown);
        else if (r?.description) parts.push(r.description);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    console.log('Playlist content length:', allContent.length);

    let playlists: PlaylistAppearance[] = [];

    if (allContent.length > 50) {
      playlists = await extractWithAI(allContent, songTitle, artist);
      console.log('AI extracted playlists:', playlists.length);
    }

    // Deduplicate by playlist name + platform
    const seen = new Set<string>();
    playlists = playlists.filter(p => {
      const key = `${p.platform}::${p.playlistName}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by followers descending, then alphabetically
    playlists.sort((a, b) => {
      if (a.followers && b.followers) return b.followers - a.followers;
      if (a.followers) return -1;
      if (b.followers) return 1;
      return a.playlistName.localeCompare(b.playlistName);
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        playlists: playlists.slice(0, 40),
        totalFound: playlists.length,
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
