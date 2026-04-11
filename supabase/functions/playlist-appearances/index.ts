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

/**
 * Strict content filter: only keep results mentioning BOTH the song title AND artist.
 */
function filterContentForSong(results: any[], songTitle: string, artist: string): string {
  const titleNorm = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const artistNorm = artist.toLowerCase().replace(/[^a-z0-9]/g, '');

  return results
    .filter((r: any) => {
      const blob = [r?.title, r?.description, r?.markdown, r?.url]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '');
      return blob.includes(titleNorm) && blob.includes(artistNorm);
    })
    .map((r: any) => {
      const parts = [];
      if (r?.title) parts.push(`Title: ${r.title}`);
      if (r?.url) parts.push(`URL: ${r.url}`);
      if (r?.markdown) parts.push(r.markdown);
      else if (r?.description) parts.push(r.description);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');
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
        temperature: 0.0,
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: `Extract playlist appearances for the SPECIFIC SONG "${songTitle}" by "${artist}".

Return ONLY a JSON array of objects:
- platform: string ("Spotify", "Apple Music", "Amazon Music", "YouTube Music", "Deezer", "Tidal")
- playlistName: string (exact playlist name)
- url: string (playlist URL if found)
- addedDate: string (date if available)
- followers: number (follower count if mentioned)

CRITICAL RULES:
1. ONLY include playlists that explicitly feature THIS SPECIFIC SONG "${songTitle}" by "${artist}"
2. Do NOT include playlists that feature OTHER songs by the same artist
3. Focus on EDITORIAL/CURATED playlists (not user-generated)
4. Return [] if no verifiable playlist data for this exact song is found
5. Do NOT fabricate data — only extract what is explicitly stated in the content
Return ONLY valid JSON array.`
          },
          {
            role: 'user',
            content: `Extract playlist appearances for the specific song "${songTitle}" by "${artist}" from this content:\n\n${content.slice(0, 15000)}`
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

/** AI knowledge fallback — strict song-specific */
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
            content: `You are a music streaming playlist expert. Given a SPECIFIC song title and artist, recall editorial playlist appearances ONLY for that exact song.

Return ONLY a JSON array of playlist appearance objects:
- platform: string ("Spotify", "Apple Music")
- playlistName: string (exact editorial playlist name)
- followers: number (approximate follower count if known)

CRITICAL RULES:
1. This is about the SPECIFIC SONG "${songTitle}" by "${artist}" — NOT playlists the artist appears on generally
2. Do NOT include playlists that feature other songs by this artist
3. Only include editorial/curated playlists you are HIGHLY CONFIDENT this specific song appeared on
4. Most songs do NOT appear on major editorial playlists — return [] unless this is a well-known hit
5. If the song was just released and you have no playlist data, return []
6. Do NOT fabricate — only report playlists consistent with widely-reported information about this specific song
7. Return ONLY valid JSON array`,
          },
          {
            role: 'user',
            content: `What editorial playlists is the specific song "${songTitle}" by "${artist}" known to have appeared on? NOT other songs by the artist — ONLY this exact song. Return [] if unsure.`,
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

    // Strategy 1: Firecrawl search — strict song + artist queries
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `"${songTitle}" "${artist}" spotify editorial playlist`,
        `"${songTitle}" "${artist}" apple music playlist`,
      ];

      const results = await Promise.all(queries.map(q => searchFirecrawl(FIRECRAWL_API_KEY, q, 5)));
      
      // STRICT: only keep results mentioning both song title AND artist
      const allContent = filterContentForSong(results.flat(), songTitle, artist);
      console.log('Playlist filtered content length:', allContent.length);

      if (allContent.length > 50) {
        playlists = await extractWithAI(allContent, songTitle, artist);
        console.log('AI extracted playlists:', playlists.length);
      }
    }

    // Strategy 2: AI knowledge fallback (strict song-specific)
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
