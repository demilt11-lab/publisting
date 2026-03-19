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

/** Fetch a URL directly */
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

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 9) continue;

    const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
    const artistTitle = stripTags(cells[2] || '');
    const normalizedRow = artistTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (normalizedRow.includes(normalizedTitle) && normalizedRow.includes(normalizedArtist)) {
      const position = parseInt(stripTags(cells[0])) || 0;
      const audience = parseFloat(stripTags(cells[6])) || 0;
      const formats = parseInt(stripTags(cells[8])) || 0;
      const peakAudience = parseFloat(stripTags(cells[9])) || 0;

      stations.push({
        station: `Billboard Radio Songs`,
        market: `US National`,
        format: `${formats} format${formats !== 1 ? 's' : ''}`,
        spins: Math.round(audience * 1000),
        rank: position,
        source: 'kworb.net / Billboard',
      });

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
    if (!res.ok) {
      console.log(`Firecrawl search failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/** Validate that extracted stations actually reference the correct song */
function validateStations(stations: RadioStation[], songTitle: string, artist: string): RadioStation[] {
  return stations.filter(s => {
    if (!s.station || typeof s.station !== 'string') return false;
    if (s.station.length < 2 || s.station.length > 100) return false;
    if (!s.spins && !s.rank) return false;
    if (s.spins && s.spins > 500000 && !s.market?.includes('National')) return false;
    return true;
  });
}

/** Extract structured radio data from scraped content using AI - STRICT parsing only */
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
            content: `You are a strict data parser. You extract ONLY radio airplay data that is EXPLICITLY written in the provided text for the EXACT song "${songTitle}" by "${artist}".

Return a JSON array of objects:
- station: string (call sign like "KIIS-FM" or chart name like "Mediabase Pop" or "Billboard Radio Songs")  
- market: string (city like "Los Angeles, CA" or "US National")
- format: string (one of: "CHR/Pop", "Hot AC", "Urban", "Rhythmic", "Country", "Adult Contemporary", "Rock", "Alternative", "Latin")
- spins: number (ONLY if a specific number is written in the text - this can be total spins, weekly spins, or audience impressions)
- rank: number (ONLY if a specific ranking/position number is in the text)
- source: string (the website URL or name where this data appeared)

ABSOLUTE RULES:
1. The text MUST explicitly mention BOTH "${songTitle}" AND "${artist}" near the radio data
2. Do NOT extract data for different songs or different artists
3. Do NOT invent, estimate, or guess ANY values - every field must come from the text
4. If the text doesn't contain verifiable radio data for this exact song, return []
5. Return [] rather than guess - accuracy over coverage
6. Historical radio data (past chart positions, total lifetime spins) is valid and should be extracted
7. Extract chart positions from Billboard Radio Songs, Mediabase charts, or any radio-specific chart

Return ONLY valid JSON array.`
          },
          {
            role: 'user',
            content: `Parse radio airplay data for EXACTLY "${songTitle}" by "${artist}" from this text. Return [] if not found:\n\n${content.slice(0, 15000)}`
          }
        ],
        temperature: 0.0,
        max_tokens: 3000,
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
    
    const raw = parsed.filter((s: any) => s.station && typeof s.station === 'string');
    return validateStations(raw, songTitle, artist);
  } catch (e) {
    console.error('AI extraction error:', e);
    return [];
  }
}

/** Build the artist slug for kworb.net (e.g. "Kendrick Lamar" → "kendricklamar") */
function kworbArtistSlug(artist: string): string {
  return artist.toLowerCase().replace(/[^a-z0-9]/g, '');
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
    const cacheKey = `v2::${songTitle.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;

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

    // === STRATEGY 1: Scrape kworb.net current radio chart ===
    const kworbCurrentPromise = fetchPage('https://kworb.net/radio/').then(html => {
      if (!html) return [];
      return parseKworbRadio(html, songTitle, artist);
    });

    // === STRATEGY 2: kworb.net artist page for historical radio data ===
    const slug = kworbArtistSlug(artist);
    const kworbArtistPromise = fetchPage(`https://kworb.net/pop/${slug}.html`).then(html => {
      if (!html) return [];
      const stations: RadioStation[] = [];
      const normalizedTitle = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Parse the artist's song table for radio peak data
      const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
      const rows = html.match(rowRegex) || [];
      
      for (const row of rows) {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (cells.length < 3) continue;
        
        const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
        const title = stripTags(cells[0] || '');
        const normalizedRow = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (normalizedRow.includes(normalizedTitle) || normalizedTitle.includes(normalizedRow)) {
          // Extract peak position and other data from the row
          for (let i = 1; i < cells.length; i++) {
            const val = parseInt(stripTags(cells[i]));
            if (val > 0 && val <= 200) {
              stations.push({
                station: 'Billboard Radio Songs (Historical)',
                market: 'US National',
                format: 'All Formats',
                rank: val,
                source: `kworb.net/pop/${slug}`,
              });
              break;
            }
          }
          break;
        }
      }
      return stations;
    });

    // === STRATEGY 3: Targeted Firecrawl searches ===
    // Multiple targeted queries for different radio data sources
    const searchQueries = [
      `"${artist}" "${songTitle}" radio airplay spins mediabase billboard`,
      `"${songTitle}" "${artist}" radio chart spins station`,
      `"${artist}" "${songTitle}" site:headline-planet.com OR site:radioinsight.com OR site:allaccess.com OR site:billboard.com radio`,
    ];

    const searchPromises = searchQueries.map(q => searchFirecrawl(firecrawlKey, q, 5));

    // Run all strategies in parallel
    const [kworbStations, kworbArtistStations, ...searchResults] = await Promise.all([
      kworbCurrentPromise,
      kworbArtistPromise,
      ...searchPromises,
    ]);

    console.log('kworb current:', kworbStations.length, 'kworb artist:', kworbArtistStations.length);

    // Filter search results to only include pages that mention BOTH the song and artist
    const normalizedTitle = songTitle.toLowerCase();
    const normalizedArtist = artist.toLowerCase();
    
    const searchContent = (searchResults as any[])
      .filter(Boolean)
      .flatMap((r: any) => r?.data || [])
      .filter((r: any) => {
        const text = ((r?.markdown || '') + ' ' + (r?.title || '') + ' ' + (r?.description || '')).toLowerCase();
        return text.includes(normalizedTitle.replace(/[^a-z0-9\s]/g, '')) && text.includes(normalizedArtist.replace(/[^a-z0-9\s]/g, ''));
      })
      .map((r: any) => {
        const parts = [];
        if (r?.title) parts.push(`Source: ${r.title}`);
        if (r?.url) parts.push(`URL: ${r.url}`);
        if (r?.markdown) parts.push(r.markdown);
        else if (r?.description) parts.push(r.description);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    console.log('Filtered search content length:', searchContent.length);

    let searchStations: RadioStation[] = [];
    if (searchContent.length > 50) {
      searchStations = await extractWithAI(searchContent, songTitle, artist);
      console.log('AI extracted verified stations:', searchStations.length);
    }

    // Merge all stations
    let stations: RadioStation[] = [
      ...kworbStations,
      ...kworbArtistStations,
      ...searchStations,
    ];

    // Deduplicate by normalized station name
    const seen = new Set<string>();
    stations = stations.filter(s => {
      const key = s.station.toUpperCase().replace(/[-\s.]/g, '') + '_' + (s.rank || '') + '_' + (s.spins || '');
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

    // Write to cache (12h for results, 6h for empty)
    const cacheTtlMs = stations.length > 0 ? 12 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    try {
      await supabase
        .from('radio_airplay_cache')
        .upsert({
          cache_key: cacheKey,
          data: responseData,
          expires_at: new Date(Date.now() + cacheTtlMs).toISOString(),
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
