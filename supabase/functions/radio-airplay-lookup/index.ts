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

/** Fetch a URL directly (no auth needed for public sites) */
async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QodaBot/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Scrape kworb.net radio chart and find song position + audience data */
function parseKworbRadio(html: string, songTitle: string, artist: string): RadioStation[] {
  const stations: RadioStation[] = [];
  const normalizedTitle = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');

  // kworb table rows: Pos | P+ | Artist - Title | Days | Pk | (x?) | Aud | Aud+ | Formats | PkAud | ...
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 9) continue;

    const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
    const artistTitle = stripTags(cells[2] || '');
    const normalizedRow = artistTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if this row matches our song
    if (normalizedRow.includes(normalizedTitle) && normalizedRow.includes(normalizedArtist)) {
      const position = parseInt(stripTags(cells[0])) || 0;
      const audience = parseFloat(stripTags(cells[6])) || 0;
      const audienceChange = stripTags(cells[7]);
      const formats = parseInt(stripTags(cells[8])) || 0;
      const peakAudience = parseFloat(stripTags(cells[9])) || 0;

      stations.push({
        station: `Billboard Radio Songs`,
        market: `US National`,
        format: `${formats} format${formats !== 1 ? 's' : ''}`,
        spins: Math.round(audience * 1000), // Audience is in millions, approximate spins
        rank: position,
        source: 'kworb.net / Billboard',
      });

      // If we found the song, also note peak position info
      if (peakAudience > audience) {
        stations.push({
          station: `Billboard Radio Songs (Peak)`,
          market: `US National`,
          format: `Peak audience`,
          spins: Math.round(peakAudience * 1000),
          rank: parseInt(stripTags(cells[4])) || position,
          source: 'kworb.net / Billboard',
        });
      }
      break;
    }
  }
  return stations;
}

/** Scrape allaccess.com Mediabase format charts */
async function scrapeAllAccessFormat(firecrawlKey: string, formatUrl: string, formatName: string, songTitle: string, artist: string): Promise<RadioStation[]> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formatUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const markdown = data?.data?.markdown || data?.markdown || '';
    if (!markdown) return [];

    // Check if song appears in the chart
    const normalizedTitle = songTitle.toLowerCase();
    const normalizedArtist = artist.toLowerCase();
    const lines = markdown.split('\n');

    const stations: RadioStation[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes(normalizedTitle) || lower.includes(normalizedArtist)) {
        // Extract spins from the line (look for numbers that could be spin counts)
        const spinsMatch = line.match(/\*\*(\d[\d,]*)\*\*/);
        const stationsMatch = line.match(/(\d+)\s*$/);
        const spins = spinsMatch ? parseInt(spinsMatch[1].replace(/,/g, '')) : undefined;

        stations.push({
          station: `Mediabase ${formatName}`,
          market: 'US National',
          format: formatName,
          spins,
          source: 'AllAccess / Mediabase',
        });
      }
    }
    return stations;
  } catch {
    return [];
  }
}

/** Search Firecrawl for real radio data pages */
async function searchFirecrawl(apiKey: string, query: string, limit = 5) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Extract structured radio data from scraped content using AI */
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
            content: `You are a radio airplay data extraction expert. Extract ONLY factual radio station airplay data from the provided scraped web content.

Return ONLY a JSON array of objects with these fields:
- station: string (call sign like "KIIS-FM", "Z100", "WHTZ" or chart name like "Mediabase Pop")
- market: string (city/region like "Los Angeles, CA" or "US National")
- format: string (one of: "CHR/Pop", "Hot AC", "Urban", "Rhythmic", "Country", "Adult Contemporary", "Rock", "Alternative", "Latin", or the format mentioned)
- spins: number (weekly spin count if mentioned in the text)
- rank: number (chart/market ranking if mentioned in the text)
- source: string (the website or service the data came from, e.g. "Mediabase", "Billboard", "AllAccess", "kworb.net")

CRITICAL RULES:
1. ONLY extract data that is explicitly present in the scraped text
2. Do NOT invent, estimate, or fabricate any data points
3. If spin counts are not mentioned, omit the spins field
4. If rankings are not mentioned, omit the rank field
5. Every station entry must have a clear source from the text
6. Return [] if no verifiable radio data is found for "${songTitle}" by "${artist}"

Return ONLY valid JSON array, no markdown or explanation.`
          },
          {
            role: 'user',
            content: `Extract radio station airplay data for "${songTitle}" by "${artist}" from this scraped content:\n\n${content.slice(0, 15000)}`
          }
        ],
        temperature: 0.0,
        max_tokens: 4000,
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

    // Check cache
    const { data: cached } = await supabase
      .from('radio_airplay_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      console.log('Radio cache hit for:', cacheKey);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // === STRATEGY 1: Scrape kworb.net radio chart directly ===
    const kworbPromise = fetchPage('https://kworb.net/radio/').then(html => {
      if (!html) return [];
      return parseKworbRadio(html, songTitle, artist);
    });

    // === STRATEGY 2: Scrape AllAccess/Mediabase format charts via Firecrawl ===
    const formatUrls: { url: string; name: string }[] = [
      { url: 'https://www.allaccess.com/top40-mainstream', name: 'CHR/Pop' },
      { url: 'https://www.allaccess.com/hot-ac', name: 'Hot AC' },
      { url: 'https://www.allaccess.com/urban', name: 'Urban' },
      { url: 'https://www.allaccess.com/rhythmic', name: 'Rhythmic' },
      { url: 'https://www.allaccess.com/country', name: 'Country' },
      { url: 'https://www.allaccess.com/adult-contemporary', name: 'Adult Contemporary' },
      { url: 'https://www.allaccess.com/alternative', name: 'Alternative' },
      { url: 'https://www.allaccess.com/active-rock', name: 'Rock' },
    ];

    // Scrape top 3 most likely formats based on simple heuristics
    const allAccessPromises = formatUrls.slice(0, 4).map(f =>
      scrapeAllAccessFormat(firecrawlKey, f.url, f.name, songTitle, artist)
    );

    // === STRATEGY 3: Search for specific station-level data ===
    const searchQueries = [
      `"${artist}" "${songTitle}" radio spins mediabase site:allaccess.com OR site:headline-planet.com OR site:radioinsight.com`,
      `"${songTitle}" "${artist}" radio airplay stations spins 2024 OR 2025 OR 2026`,
      `${artist} ${songTitle} mediabase radio chart spins`,
    ];

    const searchPromises = searchQueries.map(q => searchFirecrawl(firecrawlKey, q, 5));

    // Run all strategies in parallel
    const [kworbStations, ...allResults] = await Promise.all([
      kworbPromise,
      ...allAccessPromises,
      ...searchPromises,
    ]);

    const allAccessStations = allResults.slice(0, allAccessPromises.length).flat() as RadioStation[];
    const searchResults = allResults.slice(allAccessPromises.length);

    console.log('kworb stations:', kworbStations.length, 'allaccess stations:', allAccessStations.length);

    // Combine search result content for AI extraction
    const searchContent = (searchResults as any[])
      .filter(Boolean)
      .flatMap((r: any) => r?.data || [])
      .map((r: any) => {
        const parts = [];
        if (r?.title) parts.push(`Source: ${r.title}`);
        if (r?.url) parts.push(`URL: ${r.url}`);
        if (r?.markdown) parts.push(r.markdown);
        else if (r?.description) parts.push(r.description);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    console.log('Search content length:', searchContent.length);

    let searchStations: RadioStation[] = [];
    if (searchContent.length > 100) {
      searchStations = await extractWithAI(searchContent, songTitle, artist);
      console.log('AI extracted stations from real sources:', searchStations.length);
    }

    // Merge all stations
    let stations: RadioStation[] = [
      ...kworbStations,
      ...allAccessStations,
      ...searchStations,
    ];

    // Deduplicate by normalized station name
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
