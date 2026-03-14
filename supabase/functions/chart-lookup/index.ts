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
        temperature: 0.1,
        max_tokens: 2200,
        messages: [
          {
            role: 'system',
            content: `Extract chart placements for one song.
Return ONLY a JSON array with objects:
- chart (string, required, specific name like "Billboard Hot 100", "Billboard Global 200", "Spotify Global Top 50", "Apple Music Top 100", "UK Singles Chart")
- peakPosition (number)
- currentPosition (number)
- weeksOnChart (number)
- date (string)
- source (string)
Only include placements that clearly match the same song + artist and avoid unrelated entries.`,
          },
          {
            role: 'user',
            content: `Song: ${songTitle}\nArtist: ${artist}\n\nContent:\n${content.slice(0, 18000)}`,
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

/** AI knowledge fallback for well-known songs when scraping fails */
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
            content: `You are a music chart data expert. Given a song and artist, recall their known chart placements from your training data.

Return ONLY a JSON array of chart placement objects:
- chart: string (e.g. "Billboard Hot 100", "UK Singles Chart", "Billboard Global 200", "Canadian Hot 100", "ARIA Singles Chart", "Spotify Global Top 50")
- peakPosition: number (peak chart position)
- weeksOnChart: number (if known)
- date: string (approximate year/date of peak)
- source: "AI Knowledge"

IMPORTANT RULES:
1. Only include chart data you are reasonably confident about from widely-reported information
2. For major hits, include Billboard Hot 100, UK Singles, and other major national charts
3. If you don't know the chart history for this song, return an empty array []
4. Do NOT fabricate positions — only report data consistent with public knowledge
5. Return ONLY valid JSON array, no explanation`,
          },
          {
            role: 'user',
            content: `What are the known chart placements for "${songTitle}" by "${artist}"?`,
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

    const cacheKey = `${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;
    const { data: cached } = await supabase
      .from('chart_placements_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    const cachedPlacements = (cached?.data as any)?.data?.placements;
    if (
      cached &&
      new Date(cached.expires_at) > new Date() &&
      Array.isArray(cachedPlacements) &&
      cachedPlacements.length > 0
    ) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    let placements: ChartPlacement[] = [];

    // Strategy 1: Firecrawl search with improved queries targeting known chart sites
    if (firecrawlKey) {
      const queries = [
        `site:en.wikipedia.org "${songTitle}" "${artist}" chart positions`,
        `"${songTitle}" "${artist}" Billboard Hot 100 peak position weeks`,
        `"${songTitle}" "${artist}" chart history UK Singles ARIA`,
        `site:billboard.com "${songTitle}" "${artist}"`,
      ];

      const searchResults = (await Promise.all(queries.map((q) => searchFirecrawl(firecrawlKey, q, 5)))).flat();
      const content = searchResults
        .map((r: any) => [r?.title, r?.description, r?.markdown, r?.url].filter(Boolean).join('\n'))
        .join('\n\n---\n\n');

      console.log('Chart search content length:', content.length);

      if (content.length > 50) {
        placements = await extractWithAI(content, songTitle, artist || '');
        console.log('AI extracted chart placements:', placements.length);
      }

      // Regex fallback from search content
      if (placements.length === 0 && content.length > 50) {
        const quickMatches: ChartPlacement[] = [];
        const pushIf = (chart: string, regex: RegExp, source: string) => {
          const m = content.match(regex);
          if (m) {
            const peak = Number(m[1]);
            if (peak >= 1 && peak <= 500) quickMatches.push({ chart, peakPosition: peak, source });
          }
        };

        pushIf('Billboard Hot 100', /Billboard\s+Hot\s+100[^\n]{0,150}?(?:#|No\.?\s*|number\s+|peaked\s+(?:at\s+)?(?:#|No\.?\s*)?)(\d{1,3})/i, 'Billboard');
        pushIf('UK Singles Chart', /UK\s+(?:Singles?\s+)?Chart[^\n]{0,120}?(?:#|No\.?\s*|number\s+)(\d{1,3})/i, 'UK Charts');
        pushIf('Spotify Global Top 50', /Spotify[^\n]{0,120}?(?:#|No\.?\s*|number\s+)(\d{1,3})/i, 'Spotify');
        pushIf('Apple Music', /Apple\s+Music[^\n]{0,120}?(?:#|No\.?\s*|number\s+)(\d{1,3})/i, 'Apple Music');
        pushIf('Canadian Hot 100', /Canad[^\n]{0,120}?(?:#|No\.?\s*|number\s+)(\d{1,3})/i, 'Billboard Canada');
        placements = quickMatches;
      }
    }

    // Strategy 2: AI knowledge fallback for well-known songs
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
