import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RadioStation {
  station: string;
  market?: string;
  format?: string;
  spins?: number;
  rank?: number;
  source?: string;
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
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function extractWithAI(content: string, songTitle: string, artist: string): Promise<RadioStation[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return [];

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a radio airplay data extraction expert. Extract radio station airplay data from the provided text.

Return ONLY a JSON array of objects with these fields:
- station: string (call sign like "KIIS-FM", "Z100", "WHTZ" or station name)
- market: string (city/region like "Los Angeles, CA" or "New York, NY")
- format: string (one of: "CHR/Pop", "Hot AC", "Urban", "Rhythmic", "Country", "Adult Contemporary", "Rock", "Alternative", "Latin", or other format)
- spins: number (weekly spin count if mentioned, otherwise estimate based on chart position)
- rank: number (chart/market ranking if mentioned)
- source: string (e.g. "Mediabase", "Billboard", "Luminate", "iHeartRadio")

IMPORTANT RULES:
1. Only include stations clearly playing "${songTitle}" by "${artist}"
2. Prioritize US radio stations (major markets like NYC, LA, Chicago, etc.)
3. Include international stations if found
4. If a chart shows top stations or rankings, extract all listed stations
5. If content mentions "most added" or "top spins", extract those stations
6. For major pop hits, look for CHR/Pop, Hot AC, and Rhythmic format stations
7. Do NOT fabricate stations - only extract what's actually in the text
8. If you find chart position data (e.g. "#1 on Mediabase Pop"), note the source
9. Return an empty array [] if no real station data is found
10. Target 15-25 stations if the data supports it

Return ONLY valid JSON array, no markdown or explanation.`
          },
          {
            role: 'user',
            content: `Extract ALL radio station airplay data for "${songTitle}" by "${artist}" from this content. Look for station names, call letters, markets, formats, and spin counts:\n\n${content.slice(0, 15000)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s: any) => s.station && typeof s.station === 'string');
  } catch (e) {
    console.error('AI extraction error:', e);
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
      return new Response(
        JSON.stringify({ success: false, error: 'Song title and artist are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cacheKey = `${songTitle.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;

    // Check cache — but invalidate if fewer than 3 stations (likely incomplete)
    const { data: cached } = await supabase
      .from('radio_airplay_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      const cachedStations = (cached.data as any)?.data?.stations;
      if (Array.isArray(cachedStations) && cachedStations.length >= 3) {
        console.log('Radio cache hit for:', cacheKey, 'stations:', cachedStations.length);
        return new Response(
          JSON.stringify(cached.data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Radio cache invalidated for:', cacheKey, '- too few stations:', cachedStations?.length);
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Radio airplay lookup for:', songTitle, 'by', artist);

    // Multiple diverse queries for better coverage
    const queries = [
      `"${songTitle}" "${artist}" radio spins airplay stations Mediabase`,
      `"${songTitle}" "${artist}" billboard radio songs chart airplay 2024`,
      `"${songTitle}" "${artist}" radio airplay "top spins" OR "most added" station format CHR`,
      `"${songTitle}" "${artist}" iHeartRadio airplay luminate stations market`,
      `${artist} "${songTitle}" radio airplay chart stations format spins weekly`,
      `"${songTitle}" radio airplay CHR Hot AC Rhythmic Urban stations spins`,
    ];

    const results = await Promise.all(queries.map(q => searchFirecrawl(firecrawlKey, q, 8)));

    const allContent = results
      .filter(Boolean)
      .flatMap((r: any) => r?.data || [])
      .map((r: any) => {
        const parts = [];
        if (r?.title) parts.push(`Title: ${r.title}`);
        if (r?.url) parts.push(`URL: ${r.url}`);
        if (r?.markdown) parts.push(r.markdown);
        else if (r?.description) parts.push(r.description);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    console.log('Radio content length:', allContent.length);

    let stations: RadioStation[] = [];

    if (allContent.length > 50) {
      stations = await extractWithAI(allContent, songTitle, artist);
      console.log('AI extracted stations:', stations.length);
    }

    // Deduplicate by normalized call sign
    const seen = new Set<string>();
    stations = stations.filter(s => {
      const key = s.station.toUpperCase().replace(/[-\s.]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by spins descending, then by rank
    stations.sort((a, b) => {
      if (a.spins && b.spins) return b.spins - a.spins;
      if (a.spins) return -1;
      if (b.spins) return 1;
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.station.localeCompare(b.station);
    });

    const now = new Date().toISOString();
    const responseData = {
      success: true,
      data: {
        songTitle,
        artist,
        stations: stations.slice(0, 30),
        totalStations: stations.length,
        fetchedAt: now,
      },
    };

    // Write to cache
    try {
      await supabase
        .from('radio_airplay_cache')
        .upsert({
          cache_key: cacheKey,
          data: responseData,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'cache_key' });
    } catch (e) {
      console.error('Radio cache write failed:', e);
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Radio airplay lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup radio data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
