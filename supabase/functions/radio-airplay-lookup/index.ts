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

async function searchFirecrawl(apiKey: string, query: string, limit = 5) {
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
            content: `You extract radio airplay data from text. Return ONLY a JSON array of objects with these fields:
- station: string (call sign like "KIIS-FM" or name like "Z100")
- market: string (city/region like "Los Angeles, CA")
- format: string (e.g. "CHR/Pop", "Urban", "Hot AC", "Country", "Rhythmic")
- spins: number (weekly spin count if mentioned)
- rank: number (chart/market ranking if mentioned)
- source: string (where the data comes from, e.g. "Mediabase", "Billboard", "Luminate")

Only include stations that are clearly playing "${songTitle}" by "${artist}". 
Do NOT make up data. If no real stations are found, return an empty array [].
Return ONLY valid JSON, no markdown or explanation.`
          },
          {
            role: 'user',
            content: `Extract radio station airplay data for "${songTitle}" by "${artist}" from this content:\n\n${content.slice(0, 12000)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      console.error('AI extraction failed:', res.status);
      return [];
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse JSON from response (handle markdown code blocks)
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

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Radio airplay lookup for:', songTitle, 'by', artist);

    // Targeted searches across radio tracking sources
    const queries = [
      `"${songTitle}" "${artist}" mediabase radio spins airplay stations`,
      `"${songTitle}" "${artist}" billboard radio songs chart airplay`,
      `"${songTitle}" "${artist}" luminate radio airplay spins market`,
      `"${songTitle}" "${artist}" radio "most added" OR "top spins" OR "total audience" station format`,
    ];

    const results = await Promise.all(queries.map(q => searchFirecrawl(firecrawlKey, q, 5)));

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
      // Use AI to extract structured station data
      stations = await extractWithAI(allContent, songTitle, artist);
      console.log('AI extracted stations:', stations.length);
    }

    // Deduplicate by station name
    const seen = new Set<string>();
    stations = stations.filter(s => {
      const key = s.station.toUpperCase().replace(/[-\s]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: by spins desc, then by rank asc
    stations.sort((a, b) => {
      if (a.spins && b.spins) return b.spins - a.spins;
      if (a.spins) return -1;
      if (b.spins) return 1;
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.station.localeCompare(b.station);
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          songTitle,
          artist,
          stations: stations.slice(0, 30),
          totalStations: stations.length,
        },
      }),
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
