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

async function searchFirecrawl(apiKey: string, query: string, limit = 8) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
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
- chart (string, required, specific name like "Billboard Hot 100", "Billboard Global 200", "Spotify Global Top 50", "Apple Music Top 100")
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
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ success: false, error: 'Search service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const queries = [
      `${songTitle} ${artist} Billboard chart peak`,
      `${songTitle} ${artist} Billboard Hot 100 Global 200 chart history`,
      `${songTitle} ${artist} Spotify charts peak`,
      `${songTitle} ${artist} Apple Music charts peak`,
      `${songTitle} ${artist} Shazam chart peak`,
      `${songTitle} ${artist} chart position date`,
    ];

    const searchResults = (await Promise.all(queries.map((q) => searchFirecrawl(firecrawlKey, q, 8)))).flat();
    const content = searchResults
      .map((r: any) => [r?.title, r?.description, r?.markdown, r?.url].filter(Boolean).join('\n'))
      .join('\n\n---\n\n');

    let placements = await extractWithAI(content, songTitle, artist || '');

    if (placements.length === 0) {
      const quickMatches: ChartPlacement[] = [];
      const snippets = content.toLowerCase();
      const pushIf = (chart: string, regex: RegExp, source: string) => {
        const m = content.match(regex);
        if (m) {
          const peak = Number(m[1]);
          if (peak >= 1 && peak <= 500) quickMatches.push({ chart, peakPosition: peak, source });
        }
      };

      if (snippets.includes('billboard')) pushIf('Billboard Hot 100', /Billboard[^\n]{0,120}?(?:#|No\.?\s*)(\d{1,3})/i, 'Billboard');
      if (snippets.includes('spotify')) pushIf('Spotify Charts', /Spotify[^\n]{0,120}?(?:#|No\.?\s*)(\d{1,3})/i, 'Spotify');
      if (snippets.includes('apple music')) pushIf('Apple Music', /Apple Music[^\n]{0,120}?(?:#|No\.?\s*)(\d{1,3})/i, 'Apple Music');
      placements = quickMatches;
    }

    const byChart = new Map<string, ChartPlacement>();
    for (const p of placements) {
      const key = p.chart.trim();
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

    if (finalPlacements.length > 0) {
      await supabase.from('chart_placements_cache').upsert(
        {
          cache_key: cacheKey,
          data: responseData,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' },
      );
    }

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