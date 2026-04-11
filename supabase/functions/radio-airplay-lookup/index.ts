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

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.log(`Fetch ${url} returned ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.log(`Fetch ${url} failed:`, e instanceof Error ? e.message : 'unknown');
    return null;
  }
}

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
        station: 'Billboard Radio Songs',
        market: 'US National',
        format: `${formats} format${formats !== 1 ? 's' : ''}`,
        spins: Math.round(audience * 1000),
        rank: position,
        source: 'kworb.net / Billboard',
      });

      if (peakAudience > audience) {
        stations.push({
          station: 'Billboard Radio Songs (Peak)',
          market: 'US National',
          format: 'Peak audience',
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

/** Parse kworb.net artist page for historical radio chart data */
function parseKworbArtist(html: string, songTitle: string): RadioStation[] {
  const stations: RadioStation[] = [];
  const normalizedTitle = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 2) continue;

    const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
    const title = stripTags(cells[0] || '');
    const normalizedRow = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (normalizedRow.includes(normalizedTitle) || normalizedTitle.includes(normalizedRow)) {
      // kworb artist pages typically show: Song | Peak | Weeks | etc.
      for (let i = 1; i < Math.min(cells.length, 6); i++) {
        const val = parseInt(stripTags(cells[i]));
        if (val > 0 && val <= 200) {
          stations.push({
            station: 'Billboard Radio Songs',
            market: 'US National',
            format: 'All Formats',
            rank: val,
            source: 'kworb.net (historical)',
          });
          break;
        }
      }
      break;
    }
  }
  return stations;
}

/** Try to scrape Headline Planet for radio adds/data */
function parseHeadlinePlanet(html: string, songTitle: string, artist: string): RadioStation[] {
  const stations: RadioStation[] = [];
  const normalizedTitle = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');

  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const lower = text.toLowerCase();

  if (!lower.includes(normalizedTitle) || !lower.includes(normalizedArtist.slice(0, 8))) {
    return stations;
  }

  const formatPatterns = [
    { pattern: /(?:top\s*40|chr|pop)\s*(?:radio|adds|chart)/i, format: 'CHR/Pop' },
    { pattern: /hot\s*a\.?c\.?\s*(?:radio|adds|chart)/i, format: 'Hot AC' },
    { pattern: /urban\s*(?:radio|adds|chart)/i, format: 'Urban' },
    { pattern: /rhythmic\s*(?:radio|adds|chart)/i, format: 'Rhythmic' },
    { pattern: /adult\s*contemporary\s*(?:radio|adds|chart)/i, format: 'Adult Contemporary' },
  ];

  for (const { pattern, format } of formatPatterns) {
    if (pattern.test(text)) {
      const context = text.slice(Math.max(0, text.search(pattern) - 200), text.search(pattern) + 200);
      const numberMatch = context.match(/#(\d+)/);
      const spinsMatch = context.match(/(\d{1,3}(?:,\d{3})+)\s*(?:spins|plays)/i);

      stations.push({
        station: `Mediabase ${format}`,
        market: 'US National',
        format,
        rank: numberMatch ? parseInt(numberMatch[1]) : undefined,
        spins: spinsMatch ? parseInt(spinsMatch[1].replace(/,/g, '')) : undefined,
        source: 'Headline Planet',
      });
    }
  }

  return stations;
}

/** Parse Wikipedia article for chart performance tables */
function parseWikipediaCharts(html: string): RadioStation[] {
  const stations: RadioStation[] = [];

  const chartPatterns = [
    { pattern: /(?:billboard|us)\s*(?:radio\s*songs|mainstream\s*top\s*40|pop\s*songs|hot\s*100\s*airplay)/i, chart: 'Billboard Mainstream Top 40', format: 'CHR/Pop' },
    { pattern: /(?:billboard|us)\s*(?:rhythmic|rhythmic\s*top\s*40)/i, chart: 'Billboard Rhythmic', format: 'Rhythmic' },
    { pattern: /(?:billboard|us)\s*(?:adult\s*contemporary)/i, chart: 'Billboard Adult Contemporary', format: 'Adult Contemporary' },
    { pattern: /(?:billboard|us)\s*(?:adult\s*(?:top|pop)\s*(?:40|songs))/i, chart: 'Billboard Adult Pop Songs', format: 'Hot AC' },
    { pattern: /(?:billboard|us)\s*(?:hot\s*r&b|urban\s*contemporary)/i, chart: 'Billboard Hot R&B', format: 'Urban' },
    { pattern: /(?:billboard|us)\s*(?:country\s*airplay)/i, chart: 'Billboard Country Airplay', format: 'Country' },
    { pattern: /(?:billboard|us)\s*(?:rock\s*(?:airplay|songs)|alternative\s*airplay)/i, chart: 'Billboard Rock Airplay', format: 'Rock' },
  ];

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    if (cells.length < 2) continue;

    const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
    const rowText = cells.map(c => stripTags(c)).join(' ');

    for (const { pattern, chart, format } of chartPatterns) {
      if (pattern.test(rowText)) {
        for (let i = 1; i < Math.min(cells.length, 4); i++) {
          const val = parseInt(stripTags(cells[i]));
          if (val > 0 && val <= 200) {
            stations.push({ station: chart, market: 'US National', format, rank: val, source: 'Wikipedia' });
            break;
          }
        }
        break;
      }
    }
  }

  // Inline mentions like "peaked at number X on the Radio Songs chart"
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const inlinePatterns = [
    { regex: /(?:peaked|debuted|reached|number)\s*(?:at\s*)?(?:number\s*)?#?(\d{1,3})\s*(?:on\s*(?:the\s*)?)?(?:billboard\s*)?(?:radio\s*songs|mainstream\s*top\s*40|pop\s*songs)/i, chart: 'Billboard Radio Songs', format: 'CHR/Pop' },
    { regex: /(?:radio\s*songs|mainstream\s*top\s*40)\s*(?:chart)?\s*(?:at|with\s*a\s*peak\s*of)\s*(?:number\s*)?#?(\d{1,3})/i, chart: 'Billboard Radio Songs', format: 'CHR/Pop' },
  ];

  for (const { regex, chart, format } of inlinePatterns) {
    const match = text.match(regex);
    if (match) {
      const rank = parseInt(match[1]);
      if (rank > 0 && rank <= 200 && !stations.some(s => s.station === chart)) {
        stations.push({ station: chart, market: 'US National', format, rank, source: 'Wikipedia' });
      }
    }
  }

  return stations;
}

/** Parse acharts.co for chart peak data */
function parseAcharts(html: string): RadioStation[] {
  const stations: RadioStation[] = [];
  const chartMappings = [
    { pattern: /us\s*(?:billboard)?\s*(?:radio\s*songs|airplay)/i, chart: 'Billboard Radio Songs', format: 'CHR/Pop' },
    { pattern: /us\s*(?:billboard)?\s*(?:mainstream\s*top\s*40|pop\s*songs)/i, chart: 'Billboard Pop Songs', format: 'CHR/Pop' },
    { pattern: /us\s*(?:billboard)?\s*(?:rhythmic)/i, chart: 'Billboard Rhythmic', format: 'Rhythmic' },
    { pattern: /us\s*(?:billboard)?\s*(?:adult\s*contemporary)/i, chart: 'Billboard Adult Contemporary', format: 'Adult Contemporary' },
    { pattern: /us\s*(?:billboard)?\s*(?:adult\s*(?:pop|top\s*40))/i, chart: 'Billboard Adult Pop Songs', format: 'Hot AC' },
  ];

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 2) continue;

    const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
    const rowText = cells.map(c => stripTags(c)).join(' ');

    for (const { pattern, chart, format } of chartMappings) {
      if (pattern.test(rowText)) {
        for (let i = 1; i < Math.min(cells.length, 5); i++) {
          const val = parseInt(stripTags(cells[i]));
          if (val > 0 && val <= 200) {
            stations.push({ station: chart, market: 'US National', format, rank: val, source: 'acharts.co' });
            break;
          }
        }
        break;
      }
    }
  }
  return stations;
}

/** Use AI to extract radio data from scraped content */
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
            content: `You are a strict data parser. Extract ONLY radio airplay data for the SPECIFIC SONG "${songTitle}" by "${artist}".

Return JSON array:
- station: string (call sign or chart name like "Mediabase Pop", "Billboard Radio Songs")
- market: string ("Los Angeles, CA" or "US National")
- format: string ("CHR/Pop", "Hot AC", "Urban", "Rhythmic", "Country", "Adult Contemporary", "Rock", "Alternative", "Latin")
- spins: number (ONLY if explicitly written)
- rank: number (ONLY if explicitly written)
- source: string (website/source name)

CRITICAL RULES:
1. Text MUST mention BOTH "${songTitle}" AND "${artist}" near the data
2. Do NOT extract data for OTHER songs by the same artist
3. Do NOT extract data for songs with similar names by different artists
4. Do NOT invent or estimate values
5. Historical data (past chart positions, total spins) IS valid but ONLY for this specific song
6. Return [] if no verifiable radio data found for this exact song
Return ONLY valid JSON array.`
          },
          {
            role: 'user',
            content: `Parse radio data ONLY for the specific song "${songTitle}" by "${artist}" — not other songs by the same artist:\n\n${content.slice(0, 15000)}`
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

    return parsed
      .filter((s: any) => s.station && typeof s.station === 'string')
      .filter((s: any) => {
        if (!s.spins && !s.rank) return false;
        if (s.station.length < 2 || s.station.length > 100) return false;
        if (s.spins && s.spins > 500000 && !s.market?.includes('National')) return false;
        return true;
      });
  } catch (e) {
    console.error('AI extraction error:', e);
    return [];
  }
}

/** AI knowledge fallback for well-known songs — uses Lovable AI (no credit limits) */
async function aiKnowledgeFallback(songTitle: string, artist: string): Promise<RadioStation[]> {
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
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: `You are a US radio airplay data expert. Given a SPECIFIC song title and artist, recall US radio airplay history ONLY for that exact song.

Return ONLY a JSON array of radio station/chart objects:
- station: string (chart name like "Billboard Radio Songs", "Mediabase Pop", "Mediabase Urban")
- market: string ("US National")
- format: string ("CHR/Pop", "Urban", "Rhythmic", "Hot AC", "Adult Contemporary", "Rock", "Alternative", "Country", "Latin")
- rank: number (peak chart position if known)
- source: string ("AI Knowledge" always)

CRITICAL RULES:
1. This is about the SPECIFIC SONG "${songTitle}" by "${artist}" — NOT the artist's radio history generally
2. Do NOT return radio data for other songs by the same artist
3. Only include data for songs that genuinely had significant US radio play
4. Most songs do NOT get significant radio play — return [] unless this is a well-known radio hit
5. Do NOT fabricate positions — only report data consistent with widely-known chart history
6. If the song was just released and you have no radio data, return []
7. Return ONLY valid JSON array`,
          },
          {
            role: 'user',
            content: `What is the known US radio airplay history for the SPECIFIC SONG "${songTitle}" by "${artist}"? NOT other songs by the same artist. Return [] if unsure.`,
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
      .filter((s: any) => s.station && typeof s.station === 'string')
      .filter((s: any) => s.rank || s.spins)
      .map((s: any) => ({
        station: s.station,
        market: s.market || 'US National',
        format: s.format,
        spins: Number.isFinite(Number(s.spins)) ? Number(s.spins) : undefined,
        rank: Number.isFinite(Number(s.rank)) ? Number(s.rank) : undefined,
        source: 'AI Knowledge',
      }));
  } catch {
    return [];
  }
}

/** Search Firecrawl (if available) */
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
      console.log(`Firecrawl search: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function kworbSlug(artist: string): string {
  return artist.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build direct URLs to scrape for radio data */
function buildDirectUrls(songTitle: string, artist: string): string[] {
  const titleClean = songTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const titleSlug = titleClean.toLowerCase().replace(/\s+/g, '-');
  const artistSlug = artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const wikiTitle = titleClean.replace(/\s+/g, '_');
  const wikiArtist = artist.replace(/\s+/g, '_');

  return [
    `https://kworb.net/pop/${artistSlug}.html`,
    `https://kworb.net/radio/`,
    `https://headlineplanet.com/home/tag/${artistSlug}/`,
    // Wikipedia — multiple naming patterns
    `https://en.wikipedia.org/wiki/${wikiTitle}_(${wikiArtist}_song)`,
    `https://en.wikipedia.org/wiki/${wikiTitle}_(song)`,
    `https://en.wikipedia.org/wiki/${wikiTitle}`,
    // acharts.co — free chart tracking
    `https://acharts.co/song/${encodeURIComponent(artistSlug)}-${encodeURIComponent(titleSlug)}`,
    // Last.fm — listener data & tags for AI context
    `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(songTitle)}`,
  ];
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
    const cacheKey = `v6::${songTitle.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;

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

    console.log('Radio airplay lookup for:', songTitle, 'by', artist);

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    // === STRATEGY 1: kworb.net current radio chart ===
    const kworbCurrentPromise = fetchPage('https://kworb.net/radio/').then(html => {
      if (!html) return [];
      return parseKworbRadio(html, songTitle, artist);
    });

    // === STRATEGY 2: Direct URL scraping (no Firecrawl needed) ===
    const directUrls = buildDirectUrls(songTitle, artist);
    const directScrapePromises = directUrls.map(url => fetchPage(url, 10000));

    // === STRATEGY 3: Firecrawl search (if available) ===
    const firecrawlPromise = firecrawlKey
      ? searchFirecrawl(firecrawlKey, `"${artist}" "${songTitle}" radio airplay spins mediabase billboard`, 5)
      : Promise.resolve(null);

    // Run all in parallel
    const [kworbStations, firecrawlResult, ...directPages] = await Promise.all([
      kworbCurrentPromise,
      firecrawlPromise,
      ...directScrapePromises,
    ]);

    console.log('kworb current:', kworbStations.length);

    // Parse direct-scraped pages
    let directStations: RadioStation[] = [];
    const allScrapedContent: string[] = [];

    for (let i = 0; i < directPages.length; i++) {
      const html = directPages[i];
      if (!html) continue;

      const url = directUrls[i];
      console.log(`Scraped ${url}: ${html.length} chars`);

      // Parse kworb artist page
      if (url.includes('kworb.net/pop/')) {
        const artistStations = parseKworbArtist(html, songTitle);
        directStations.push(...artistStations);
        console.log('kworb artist stations:', artistStations.length);
      }

      // Parse Headline Planet
      if (url.includes('headlineplanet.com')) {
        const hpStations = parseHeadlinePlanet(html, songTitle, artist);
        directStations.push(...hpStations);
      }

      // Parse Wikipedia chart tables
      if (url.includes('wikipedia.org')) {
        const wikiStations = parseWikipediaCharts(html);
        directStations.push(...wikiStations);
        console.log('Wikipedia chart stations:', wikiStations.length);
      }

      // Parse acharts.co
      if (url.includes('acharts.co')) {
        const achartsStations = parseAcharts(html);
        directStations.push(...achartsStations);
        console.log('acharts stations:', achartsStations.length);
      }

      // Collect text content for AI extraction
      const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (textContent.length > 100) {
        const nTitle = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nArtistFirst = artist.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
        const lower = textContent.toLowerCase();

        const hasTitle = lower.includes(nTitle);
        const hasArtist = lower.includes(nArtistFirst);
        console.log(`Content filter for ${url}: hasTitle=${hasTitle} hasArtist=${hasArtist} (len=${textContent.length})`);

        if (hasTitle && hasArtist) {
          // Find the region around the song title mention for focused AI extraction
          const titleIdx = lower.indexOf(nTitle);
          const contextStart = Math.max(0, titleIdx - 2000);
          const contextEnd = Math.min(textContent.length, titleIdx + 3000);
          const contextSlice = textContent.slice(contextStart, contextEnd);
          allScrapedContent.push(`Source URL: ${url}\n${contextSlice}`);
        } else if (hasArtist && (url.includes('headlineplanet') || url.includes('wikipedia') || url.includes('last.fm') || url.includes('acharts'))) {
          allScrapedContent.push(`Source URL: ${url}\n${textContent.slice(0, 6000)}`);
        }
      }
    }

    // Process Firecrawl results
    const normalizedTitle = songTitle.toLowerCase();
    const normalizedArtist = artist.toLowerCase();

    if (firecrawlResult?.data) {
      const firecrawlContent = firecrawlResult.data
        .filter((r: any) => {
          const text = ((r?.markdown || '') + ' ' + (r?.title || '')).toLowerCase();
          return text.includes(normalizedTitle.replace(/[^a-z0-9\s]/g, '')) &&
                 text.includes(normalizedArtist.replace(/[^a-z0-9\s]/g, ''));
        })
        .map((r: any) => {
          const parts = [];
          if (r?.url) parts.push(`Source: ${r.url}`);
          if (r?.markdown) parts.push(r.markdown);
          return parts.join('\n');
        })
        .join('\n\n---\n\n');

      if (firecrawlContent.length > 50) {
        allScrapedContent.push(firecrawlContent);
      }
      console.log('Firecrawl content length:', firecrawlContent.length);
    } else {
      console.log('Firecrawl unavailable or returned no results');
    }

    // Use AI to extract radio data from all collected content
    let aiStations: RadioStation[] = [];
    if (allScrapedContent.length > 0) {
      const combined = allScrapedContent.join('\n\n===\n\n');
      console.log('Total scraped content for AI:', combined.length, 'chars from', allScrapedContent.length, 'sources');
      aiStations = await extractWithAI(combined, songTitle, artist);
      console.log('AI extracted stations:', aiStations.length);
    }

    // Merge all stations from scraping
    let stations: RadioStation[] = [
      ...kworbStations,
      ...directStations,
      ...aiStations,
    ];

    // STRATEGY 4: AI Knowledge fallback — free, no API credits needed
    // Use when scraping yielded fewer than 3 results
    if (stations.length < 3) {
      console.log('Scraping yielded only', stations.length, 'stations — using AI knowledge fallback');
      const aiKnowledge = await aiKnowledgeFallback(songTitle, artist);
      console.log('AI knowledge returned', aiKnowledge.length, 'stations');
      stations.push(...aiKnowledge);
    }

    // Deduplicate
    const seen = new Set<string>();
    stations = stations.filter(s => {
      // Normalize station name for dedup (e.g. "Mediabase Pop" vs "Mediabase CHR/Pop")
      const normalizedStation = s.station.toUpperCase().replace(/[-\s.()\/]/g, '');
      const key = normalizedStation + '_' + (s.format || '').toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by spins desc, then rank asc
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
        searchServiceAvailable: !!firecrawlResult,
      },
    };

    // Cache: 12h if results, 4h if empty
    const cacheTtlMs = stations.length > 0 ? 12 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
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
