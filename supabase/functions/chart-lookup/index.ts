import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ChartPlacement {
  chart: string;
  peakPosition?: number;
  currentPosition?: number;
  weeksOnChart?: number;
  date?: string;
  source?: string;
}

async function searchFirecrawl(apiKey: string, query: string, limit = 5) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
}

/**
 * Strict content filter: only keep search results whose text mentions
 * BOTH the song title AND the artist, preventing artist-only matches.
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
    .map((r: any) => [r?.title, r?.description, r?.markdown, r?.url].filter(Boolean).join('\n'))
    .join('\n\n---\n\n');
}

async function extractWithAI(content: string, songTitle: string, artist: string): Promise<ChartPlacement[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || content.length < 40) return [];

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
        max_tokens: 2200,
        messages: [
          {
            role: 'system',
            content: `Extract chart placements for ONE SPECIFIC SONG: "${songTitle}" by "${artist}".

Return ONLY a JSON array with objects:
- chart (string, e.g. "Billboard Hot 100", "UK Singles Chart", "Spotify Global Top 50")
- peakPosition (number)
- currentPosition (number, only if explicitly stated as current)
- weeksOnChart (number, ONLY if explicitly stated in the text)
- date (string)
- source (string, the website/source where data was found)

CRITICAL RULES:
1. ONLY include chart data that EXPLICITLY mentions BOTH the exact song title "${songTitle}" AND the artist "${artist}" together
2. Do NOT include chart data for OTHER songs by the same artist
3. Do NOT include chart data for songs with similar names by different artists
4. Do NOT guess or estimate weeksOnChart — only include if the text explicitly states it
5. If the text discusses the artist's chart history generally but doesn't mention this specific song, return []
6. Return [] if you are not confident the data is for this exact song`,
          },
          {
            role: 'user',
            content: `Song: "${songTitle}"\nArtist: "${artist}"\n\nContent:\n${content.slice(0, 18000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((p: any) => typeof p?.chart === 'string' && p.chart.trim())
      .map((p: any) => ({
        chart: String(p.chart).trim(),
        peakPosition: Number.isFinite(Number(p.peakPosition)) ? Number(p.peakPosition) : undefined,
        currentPosition: Number.isFinite(Number(p.currentPosition)) ? Number(p.currentPosition) : undefined,
        weeksOnChart: Number.isFinite(Number(p.weeksOnChart)) ? Number(p.weeksOnChart) : undefined,
        date: typeof p.date === 'string' ? p.date.trim() : undefined,
        source: typeof p.source === 'string' ? p.source.trim() : undefined,
      }))
      .filter((p) => !p.peakPosition || (p.peakPosition >= 1 && p.peakPosition <= 500));
  } catch {
    return [];
  }
}

/** AI knowledge fallback — VERY strict to avoid hallucination */
async function aiKnowledgeFallback(songTitle: string, artist: string): Promise<ChartPlacement[]> {
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
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `You are a music chart data expert. Given a SPECIFIC song title and artist, recall chart placements ONLY for that exact song.

Return ONLY a JSON array of chart placement objects:
- chart: string (e.g. "Billboard Hot 100", "UK Singles Chart")
- peakPosition: number
- weeksOnChart: number (ONLY if you are highly confident of the exact number)
- date: string (approximate year/date of peak)
- source: "AI Knowledge"

CRITICAL RULES:
1. This is about the SPECIFIC SONG "${songTitle}" by "${artist}" — NOT the artist's general chart history
2. Do NOT return chart data for other songs by this artist
3. Do NOT guess — if you don't know the specific chart history for THIS song, return []
4. Most songs do NOT chart on Billboard Hot 100 — only major hits do. Return [] for songs you haven't seen widely reported chart data for
5. Do NOT fabricate weeksOnChart numbers — omit this field if uncertain
6. If the song was just released recently and you have no chart data, return []
7. Return ONLY valid JSON array, no explanation`,
          },
          {
            role: 'user',
            content: `What are the known chart placements for the song "${songTitle}" by "${artist}"? Remember: ONLY this specific song, not other songs by the same artist. Return [] if unsure.`,
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
      .filter((p: any) => typeof p?.chart === 'string' && p.chart.trim() && p.peakPosition)
      .map((p: any) => ({
        chart: String(p.chart).trim(),
        peakPosition: Number(p.peakPosition),
        weeksOnChart: Number.isFinite(Number(p.weeksOnChart)) ? Number(p.weeksOnChart) : undefined,
        date: typeof p.date === 'string' ? p.date.trim() : undefined,
        source: 'AI Knowledge',
      }))
      .filter((p) => p.peakPosition >= 1 && p.peakPosition <= 500);
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
    if (!songTitle) {
      return new Response(JSON.stringify({ success: false, error: 'Song title is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Cache key includes version to bust stale hallucinated data
    const cacheKey = `v2::${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;
    const { data: cached } = await supabase
      .from('chart_placements_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    const cachedPlacements = (cached?.data as any)?.data?.placements;
    if (
      cached &&
      new Date(cached.expires_at) > new Date() &&
      Array.isArray(cachedPlacements)
    ) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    let placements: ChartPlacement[] = [];

    // Strategy 1: Firecrawl search — require BOTH song title and artist in queries
    if (firecrawlKey) {
      const queries = [
        `"${songTitle}" "${artist}" chart positions peak Billboard`,
        `"${songTitle}" "${artist}" Billboard Hot 100 UK Singles Chart peak`,
        `site:en.wikipedia.org "${songTitle}" "${artist}" chart`,
      ];

      const searchResults = (await Promise.all(queries.map((q) => searchFirecrawl(firecrawlKey, q, 5)))).flat();
      
      // STRICT: only keep results that mention both song title AND artist
      const content = filterContentForSong(searchResults, songTitle, artist || '');
      console.log('Chart search filtered content length:', content.length);

      if (content.length > 50) {
        placements = await extractWithAI(content, songTitle, artist || '');
        console.log('AI extracted chart placements:', placements.length);
      }
    }

    // Strategy 2: AI knowledge fallback (strict song-specific)
    if (placements.length === 0) {
      console.log('Using AI knowledge fallback for chart data');
      placements = await aiKnowledgeFallback(songTitle, artist || '');
      console.log('AI knowledge returned', placements.length, 'placements');
    }

    // Deduplicate by chart name
    const byChart = new Map<string, ChartPlacement>();
    for (const p of placements) {
      const key = p.chart.trim().toLowerCase();
      const existing = byChart.get(key);
      if (!existing) {
        byChart.set(key, p);
      } else {
        const currentPeak = existing.peakPosition ?? 999;
        const nextPeak = p.peakPosition ?? 999;
        if (nextPeak < currentPeak) byChart.set(key, { ...existing, ...p });
      }
    }

    const finalPlacements = [...byChart.values()].sort((a, b) => (a.peakPosition ?? 999) - (b.peakPosition ?? 999));

    const responseData = {
      success: true,
      data: { songTitle, artist, placements: finalPlacements },
    };

    // Cache results (even empty for 2h to avoid repeated failures)
    const ttl = finalPlacements.length > 0 ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    await supabase.from('chart_placements_cache').upsert(
      {
        cache_key: cacheKey,
        data: responseData,
        expires_at: new Date(Date.now() + ttl).toISOString(),
      },
      { onConflict: 'cache_key' },
    );

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup charts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
