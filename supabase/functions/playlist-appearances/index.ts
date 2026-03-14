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

async function searchFirecrawl(apiKey: string, query: string, limit = 5) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
      signal: AbortSignal.timeout(12000),
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
            content: `Extract playlist appearances for a specific song. Return ONLY a JSON array of objects:
- platform: string ("Spotify", "Apple Music", "Amazon Music", "YouTube Music", "Deezer", "Tidal")
- playlistName: string (exact playlist name)
- url: string (playlist URL if found)
- addedDate: string (date if available)
- followers: number (follower count if mentioned)

RULES:
1. Only include playlists that clearly feature "${songTitle}" by "${artist}"
2. Focus on EDITORIAL/CURATED playlists (not user-generated)
3. Return empty array [] if no real playlist data is found
4. Do NOT fabricate data
Return ONLY valid JSON array.`
          },
          {
            role: 'user',
            content: `Extract ALL playlist appearances for "${songTitle}" by "${artist}" from this content:\n\n${content.slice(0, 15000)}`
          }
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: any) => p.platform && p.playlistName);
  } catch {
    return [];
  }
}

/** AI knowledge fallback for well-known songs */
async function aiKnowledgeFallback(songTitle: string, artist: string): Promise<PlaylistAppearance[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return [];

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.0,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: `You are a music streaming playlist expert. Given a song and artist, recall their known editorial playlist appearances from your training data.

Return ONLY a JSON array of playlist appearance objects:
- platform: string ("Spotify", "Apple Music", "Amazon Music", "YouTube Music", "Deezer")
- playlistName: string (exact editorial playlist name)
- followers: number (approximate follower count if known)

IMPORTANT RULES:
1. Only include editorial/curated playlists the song was known to appear on
2. For major Spotify hits, common playlists include: Today's Top Hits, Pop Rising, Mood Booster, Chill Hits, All Out (decade playlists), Songs to Sing in the Car, etc.
3. For Apple Music: Today's Hits, A-List Pop, New Music Daily, etc.
4. Only include playlists you are confident the song appeared on based on its genre, era, and popularity
5. If the song is not well-known enough to have editorial playlist data, return []
6. Do NOT fabricate — only report playlists consistent with the song's genre and chart success
7. Return ONLY valid JSON array`,
          },
          {
            role: 'user',
            content: `What editorial playlists is "${songTitle}" by "${artist}" known to have appeared on?`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((p: any) => p.platform && p.playlistName)
      .map((p: any) => ({
        platform: p.platform,
        playlistName: p.playlistName,
        followers: Number.isFinite(Number(p.followers)) ? Number(p.followers) : undefined,
      }));
  } catch {
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

    console.log('Playlist appearances lookup for:', songTitle, 'by', artist);

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    let playlists: PlaylistAppearance[] = [];

    // Strategy 1: Firecrawl search with site-targeted queries
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `"${songTitle}" "${artist}" spotify editorial playlist "Today's Top Hits" OR "Pop Rising" OR "Chill Hits"`,
        `"${songTitle}" "${artist}" apple music playlist "A-List Pop" OR "Today's Hits" OR "New Music Daily"`,
        `site:everynoise.com OR site:chartmetric.com "${songTitle}" "${artist}" playlist`,
      ];

      const results = await Promise.all(queries.map(q => searchFirecrawl(FIRECRAWL_API_KEY, q, 5)));
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

      if (allContent.length > 50) {
        playlists = await extractWithAI(allContent, songTitle, artist);
        console.log('AI extracted playlists:', playlists.length);
      }
    }

    // Strategy 2: AI knowledge fallback
    if (playlists.length === 0) {
      console.log('Using AI knowledge fallback for playlist data');
      playlists = await aiKnowledgeFallback(songTitle, artist);
      console.log('AI knowledge returned', playlists.length, 'playlists');
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
