const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DiscogsSongData {
  title: string;
  artist: string;
  producers: Array<{ name: string; role: 'producer' }>;
  writers: Array<{ name: string; role: 'writer' }>;
  album?: string;
  releaseDate?: string;
}

interface DiscogsArtist {
  name: string;
  id: number;
  role?: string;
}

interface DiscogsExtraartist {
  name: string;
  id: number;
  role: string;
}

interface DiscogsTrack {
  title: string;
  position: string;
  extraartists?: DiscogsExtraartist[];
}

interface DiscogsRelease {
  id: number;
  title: string;
  artists?: DiscogsArtist[];
  extraartists?: DiscogsExtraartist[];
  tracklist?: DiscogsTrack[];
  released?: string;
  year?: number;
}

interface DiscogsSearchResult {
  id: number;
  type: string;
  title: string;
  year?: number;
  resource_url: string;
}

// Producer role patterns to match in Discogs credits
const producerRolePatterns = [
  /^producer$/i,
  /^produced by$/i,
  /^co-producer$/i,
  /^executive producer$/i,
];

// Writer role patterns
const writerRolePatterns = [
  /written[-\s]?by/i,
  /composed by/i,
  /composer/i,
  /songwriter/i,
  /lyrics by/i,
  /lyricist/i,
  /music by/i,
];

function isProducerRole(role: string): boolean {
  return producerRolePatterns.some(pattern => pattern.test(role));
}

function isWriterRole(role: string): boolean {
  return writerRolePatterns.some(pattern => pattern.test(role));
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-') // normalize hyphens
    .replace(/[''`]/g, "'") // normalize quotes
    .replace(/[""]/g, '"')
    .replace(/\s*\(.*?\)\s*/g, ' ') // remove parenthetical content
    .replace(/\s*\[.*?\]\s*/g, ' ') // remove bracketed content
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(title1: string, title2: string): boolean {
  const n1 = normalizeTitle(title1);
  const n2 = normalizeTitle(title2);
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

import { createClient } from 'npm:@supabase/supabase-js@2';

const CACHE_TTL_HOURS = 168; // 7 days

async function getCache(cacheKey: string): Promise<any | null> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data } = await supabase
      .from('streaming_stats_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) {
      return data.data;
    }
    return null;
  } catch { return null; }
}

async function setCache(cacheKey: string, value: any): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const expires_at = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from('streaming_stats_cache')
      .upsert({ cache_key: cacheKey, data: value, expires_at }, { onConflict: 'cache_key' });
  } catch (e) { console.warn('Cache write failed:', e); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, artist } = await req.json();

    if (!title || !artist) {
      return new Response(
        JSON.stringify({ success: false, error: 'Title and artist are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Discogs API lookup for:', { title, artist });

    // Check server-side cache first
    const cacheKey = `discogs_${title.toLowerCase().trim()}_${artist.toLowerCase().trim()}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log('Discogs cache hit for:', cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const discogsToken = Deno.env.get('DISCOGS_TOKEN');
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Try official Discogs API first if token is available
    if (discogsToken) {
      const apiResult = await lookupViaDiscogsAPI(title, artist, discogsToken);
      if (apiResult && (apiResult.producers.length > 0 || apiResult.writers.length > 0)) {
        console.log('Discogs API found credits:', {
          producers: apiResult.producers.length,
          writers: apiResult.writers.length,
        });
        await setCache(cacheKey, apiResult);
        return new Response(
          JSON.stringify({ success: true, data: apiResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fallback to Firecrawl scraping if API didn't find results
    if (firecrawlKey) {
      console.log('Falling back to Firecrawl scraping...');
      const scrapeResult = await lookupViaFirecrawl(title, artist, firecrawlKey);
      if (scrapeResult) {
        await setCache(cacheKey, scrapeResult);
        return new Response(
          JSON.stringify({ success: true, data: scrapeResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Cache empty result to avoid re-querying
    await setCache(cacheKey, null);

    // No results found
    return new Response(
      JSON.stringify({ success: true, data: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in Discogs lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function lookupViaDiscogsAPI(
  title: string,
  artist: string,
  token: string
): Promise<DiscogsSongData | null> {
  const userAgent = 'SongCreditsLookup/1.0 +https://lovable.dev';
  
  // Search for releases matching the track
  const searchQuery = encodeURIComponent(`${artist} ${title}`);
  const searchUrl = `https://api.discogs.com/database/search?q=${searchQuery}&type=release&per_page=10`;
  
  console.log('Discogs API search:', searchUrl);
  
  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Discogs token=${token}`,
      'User-Agent': userAgent,
    },
  });

  if (!searchResponse.ok) {
    console.log('Discogs API search failed:', searchResponse.status);
    return null;
  }

  const searchData = await searchResponse.json();
  const results: DiscogsSearchResult[] = searchData.results || [];
  
  console.log('Discogs API search results:', results.length);

  if (results.length === 0) {
    return null;
  }

  // Check up to 3 releases for the track
  for (const result of results.slice(0, 3)) {
    // Rate limiting - Discogs requires 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const releaseUrl = `https://api.discogs.com/releases/${result.id}`;
    console.log('Fetching Discogs release:', releaseUrl);
    
    const releaseResponse = await fetch(releaseUrl, {
      headers: {
        'Authorization': `Discogs token=${token}`,
        'User-Agent': userAgent,
      },
    });

    if (!releaseResponse.ok) {
      console.log('Discogs release fetch failed:', releaseResponse.status);
      continue;
    }

    const release: DiscogsRelease = await releaseResponse.json();
    
    // Find the matching track in the tracklist
    const matchingTrack = release.tracklist?.find(track => 
      titlesMatch(track.title, title)
    );

    const producers: Array<{ name: string; role: 'producer' }> = [];
    const writers: Array<{ name: string; role: 'writer' }> = [];
    const seenProducers = new Set<string>();
    const seenWriters = new Set<string>();

    // Extract credits from the track's extraartists
    if (matchingTrack?.extraartists) {
      for (const ea of matchingTrack.extraartists) {
        const nameLower = ea.name.toLowerCase();
        
        if (isProducerRole(ea.role) && !seenProducers.has(nameLower)) {
          seenProducers.add(nameLower);
          producers.push({ name: ea.name, role: 'producer' });
        }
        
        if (isWriterRole(ea.role) && !seenWriters.has(nameLower)) {
          seenWriters.add(nameLower);
          writers.push({ name: ea.name, role: 'writer' });
        }
      }
    }

    // NOTE: Release-level extraartists are intentionally skipped here.
    // They contain album-wide credits (e.g. executive producers, mixing engineers)
    // that may not be associated with this specific track, causing false positives.

    if (producers.length > 0 || writers.length > 0) {
      console.log('Discogs API found producers:', producers);
      console.log('Discogs API found writers:', writers);

      return {
        title,
        artist,
        producers,
        writers,
        album: release.title,
        releaseDate: release.released || (release.year ? String(release.year) : undefined),
      };
    }
  }

  return null;
}

async function lookupViaFirecrawl(
  title: string,
  artist: string,
  apiKey: string
): Promise<DiscogsSongData | null> {
  // Search Discogs for the release containing this track
  const searchQuery = `site:discogs.com "${artist}" "${title}"`;
  console.log('Searching Discogs via Firecrawl:', searchQuery);

  const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: searchQuery,
      limit: 5,
      scrapeOptions: {
        formats: ['markdown'],
      },
    }),
  });

  if (!searchResponse.ok) {
    console.log('Discogs Firecrawl search failed:', searchResponse.status);
    return null;
  }

  const searchData = await searchResponse.json();
  console.log('Discogs Firecrawl search results:', searchData?.data?.length || 0);

  if (!searchData?.data?.length) {
    return null;
  }

  // Find a release page (not master, not artist page)
  const releaseUrl = searchData.data.find((r: any) => 
    r.url?.includes('discogs.com') && 
    (r.url?.includes('/release/') || r.url?.includes('/master/')) &&
    !r.url?.includes('/artist/')
  )?.url;

  if (!releaseUrl) {
    console.log('No matching Discogs release page found');
    return null;
  }

  console.log('Scraping Discogs page:', releaseUrl);

  // Scrape the Discogs page for credits
  const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: releaseUrl,
      formats: ['markdown'],
    }),
  });

  if (!scrapeResponse.ok) {
    console.log('Discogs Firecrawl scrape failed:', scrapeResponse.status);
    return null;
  }

  const scrapeData = await scrapeResponse.json();
  const content = scrapeData?.data?.markdown || '';
  
  console.log('Scraped Discogs content length:', content.length);

  // Extract producers and writers from the page content
  const producers: Array<{ name: string; role: 'producer' }> = [];
  const writers: Array<{ name: string; role: 'writer' }> = [];

  // Discogs uses a Credits section with role - name format
  const producerPatterns = [
    /Produc(?:er|ed By)\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Executive Producer\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Co-Producer\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /\*\*Producer\*\*\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Mixed By\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Remix(?:ed)?\s*[–\-:]\s*([^\n\[\]]+)/gi,
  ];

  for (const pattern of producerPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const names = match[1]
        .split(/[,&]/)
        .map(n => n.trim())
        .filter(n => n.length > 0 && n.length < 60 && !n.includes('http') && !n.includes('('));
      
      for (const name of names) {
        const cleanName = name
          .replace(/\*+/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\(\d+\)/g, '')
          .trim();
        
        if (cleanName && cleanName.length > 1 && !producers.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
          producers.push({ name: cleanName, role: 'producer' });
        }
      }
    }
  }

  const writerPatterns = [
    /Written[-\s]By\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Composed By\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Lyrics By\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Music By\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /Songwriter\s*[–\-:]\s*([^\n\[\]]+)/gi,
    /\*\*Written By\*\*\s*[–\-:]\s*([^\n\[\]]+)/gi,
  ];

  for (const pattern of writerPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const names = match[1]
        .split(/[,&]/)
        .map(n => n.trim())
        .filter(n => n.length > 0 && n.length < 60 && !n.includes('http') && !n.includes('('));
      
      for (const name of names) {
        const cleanName = name
          .replace(/\*+/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\(\d+\)/g, '')
          .trim();
        
        if (cleanName && cleanName.length > 1 && !writers.find(w => w.name.toLowerCase() === cleanName.toLowerCase())) {
          writers.push({ name: cleanName, role: 'writer' });
        }
      }
    }
  }

  console.log('Discogs Firecrawl found producers:', producers);
  console.log('Discogs Firecrawl found writers:', writers);

  if (producers.length === 0 && writers.length === 0) {
    return null;
  }

  return {
    title,
    artist,
    producers,
    writers,
  };
}
