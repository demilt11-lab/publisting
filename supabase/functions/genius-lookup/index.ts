const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GeniusSongData {
  title: string;
  artist: string;
  producers: Array<{ name: string; role: 'producer' }>;
  writers: Array<{ name: string; role: 'writer' }>;
  album?: string;
  releaseDate?: string;
  artistSocialLinks?: Record<string, Record<string, string>>; // name -> { instagram, twitter, etc. }
}

interface GeniusHit {
  result: {
    id: number;
    title: string;
    primary_artist: { name: string };
    url: string;
  };
}

interface GeniusSongDetails {
  song: {
    id: number;
    title: string;
    primary_artist: { name: string };
    album?: { name: string };
    release_date_for_display?: string;
    writer_artists?: Array<{ name: string }>;
    producer_artists?: Array<{ name: string }>;
    custom_performances?: Array<{
      label: string;
      artists: Array<{ name: string }>;
    }>;
  };
}

// Junk patterns to filter out — only match descriptive/meta text, NOT instrument words or articles
const junkPatterns = [
  /frequent\s+collaborator/i, /long[- ]?time/i, /worked\s+with/i, /known\s+for/i,
  /also\s+known/i, /previously/i, /according\s+to/i, /credits?\s+include/i,
  /has\s+produced/i, /has\s+written/i, /best\s+known/i, /notable/i, /grammy/i,
  /award[- ]?winning/i, /multi[- ]?platinum/i, /billboard/i, /chart[- ]?topping/i,
  /hit\s+song/i, /number[- ]?one/i, /top\s+\d+/i, /million\s+copies/i,
  /record\s+label/i, /signed\s+to/i, /booking/i, /contact/i,
  /email/i, /follow\s+on/i, /social\s+media/i, /twitter|instagram|facebook|tiktok/i,
  /official\s+website/i, /read\s+more/i, /see\s+all/i, /view\s+all/i,
  /show\s+more/i, /expand/i, /collapse/i, /lyrics\s+provided/i,
  /genius\s+annotation/i, /verified\s+artist/i, /about\s+genius/i, /sign\s+up/i,
  /log\s+in/i, /subscribe/i, /community/i, /contributors/i, /transcriber/i,
  /iq\s+points/i, /song\s+bio/i, /track\s+info/i,
  /recording\s+location/i, /mixed\s+by/i,
  /mastered\s+by/i, /engineered\s+by/i, /assistant\s+engineer/i,
  /additional\s+production/i,
  /courtesy\s+of/i,
  /under\s+license/i, /copyright/i, /all\s+rights/i, /published\s+by/i,
  /administered/i, /®|™|©|℗/, /\d{4}\s+\w+\s+records/i, /inc\.|llc|ltd|corp/i,
];

function isJunkName(name: string): boolean {
  if (name.length < 2 || name.length > 60) return true;
  if (/https?:\/\//i.test(name)) return true;
  if (/^\d+$/.test(name) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(name)) return true;
  for (const pattern of junkPatterns) {
    if (pattern.test(name)) return true;
  }
  const words = name.split(/\s+/);
  if (words.length > 6) return true;
  return false;
}

function cleanName(name: string): string | null {
  let clean = String(name)
    .replace(/\*+/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/["'""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/[,;:.!?]+$/, '').replace(/\s+(and|&)\s*$/i, '').trim();
  if (!clean || isJunkName(clean)) return null;
  // Preserve Unicode names (Korean, Japanese, Hindi, Arabic, etc.)
  // Only reject if name is purely ASCII punctuation/symbols
  if (/^[\p{P}\p{S}\s]+$/u.test(clean)) return null;
  return clean;
}

function normalizeUnicode(text: string): string {
  // Normalize Unicode for comparison (NFC form) and handle transliteration edge cases
  try { return text.normalize('NFC'); } catch { return text; }
}

function normalizeTitle(title: string): string {
  return normalizeUnicode(title)
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[''`\u2018\u2019]/g, "'")
    .replace(/[""\u201C\u201D]/g, '"')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(title1: string, title2: string): boolean {
  const n1 = normalizeTitle(title1);
  const n2 = normalizeTitle(title2);
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

/**
 * Improved artist matching: use the longest meaningful word (not articles/prepositions)
 * to avoid matching "the" from "The Weeknd" against everything.
 */
function artistsMatch(resultArtist: string, searchArtist: string): boolean {
  const nResult = normalizeTitle(resultArtist);
  const nSearch = normalizeTitle(searchArtist);
  
  // Exact or substring match
  if (nResult === nSearch || nResult.includes(nSearch) || nSearch.includes(nResult)) return true;
  
  // Extract meaningful words (skip articles, prepositions)
  const skipWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'feat', 'ft']);
  const searchWords = nSearch.split(/\s+/).filter(w => !skipWords.has(w) && w.length > 1);
  
  if (searchWords.length === 0) return false;
  
  // Check if the longest meaningful word appears in the result
  const longestWord = searchWords.sort((a, b) => b.length - a.length)[0];
  return nResult.includes(longestWord);
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

    console.log('Genius lookup for:', { title, artist });

    const geniusToken = Deno.env.get('GENIUS_TOKEN');
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Try official Genius API first
    if (geniusToken) {
      const apiResult = await lookupViaGeniusAPI(title, artist, geniusToken);
      if (apiResult && (apiResult.producers.length > 0 || apiResult.writers.length > 0)) {
        console.log('Genius API found credits:', {
          producers: apiResult.producers.length,
          writers: apiResult.writers.length,
        });
        return new Response(
          JSON.stringify({ success: true, data: apiResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fallback to Firecrawl scraping
    if (firecrawlKey) {
      console.log('Falling back to Firecrawl scraping...');
      const scrapeResult = await lookupViaFirecrawl(title, artist, firecrawlKey);
      if (scrapeResult) {
        return new Response(
          JSON.stringify({ success: true, data: scrapeResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in Genius lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function lookupViaGeniusAPI(
  title: string,
  artist: string,
  token: string
): Promise<GeniusSongData | null> {
  // Search with multiple query variants for better matching
  const queries = [
    `${artist} ${title}`,
    `${title} ${artist}`,
  ];
  
  let bestSongId: number | null = null;
  let allHits: GeniusHit[] = [];

  for (const searchQuery of queries) {
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(searchQuery)}&per_page=10`;
    console.log('Genius API search:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!searchResponse.ok) {
      console.log('Genius API search failed:', searchResponse.status);
      continue;
    }

    const searchData = await searchResponse.json();
    const hits: GeniusHit[] = searchData.response?.hits || [];
    allHits = [...allHits, ...hits];

    if (hits.length === 0) continue;

    // Find best matching song using improved matching
    const matchingHit = hits.find(hit => {
      return titlesMatch(hit.result.title, title) && 
             artistsMatch(hit.result.primary_artist.name, artist);
    });

    if (matchingHit) {
      bestSongId = matchingHit.result.id;
      console.log('Matched song:', matchingHit.result.title, 'by', matchingHit.result.primary_artist.name);
      break;
    }
  }

  // Do NOT fallback to first hit — it often matches a completely different song,
  // injecting wrong credits. Only use confirmed title+artist matches.
  if (!bestSongId) {
    console.log('No matching Genius song found (skipping first-hit fallback to avoid wrong credits)');
    return null;
  }

  if (!bestSongId) return null;

  console.log('Fetching Genius song details:', bestSongId);

  // Get detailed song info with credits
  const songUrl = `https://api.genius.com/songs/${bestSongId}?text_format=plain`;
  const songResponse = await fetch(songUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!songResponse.ok) {
    console.log('Genius song fetch failed:', songResponse.status);
    return null;
  }

  const songData: { response: GeniusSongDetails } = await songResponse.json();
  const song = songData.response.song;

  const producers: Array<{ name: string; role: 'producer' }> = [];
  const writers: Array<{ name: string; role: 'writer' }> = [];
  const seenProducers = new Set<string>();
  const seenWriters = new Set<string>();

  // Extract producers from producer_artists
  if (song.producer_artists) {
    for (const producer of song.producer_artists) {
      const clean = cleanName(producer.name);
      if (clean && !seenProducers.has(clean.toLowerCase())) {
        seenProducers.add(clean.toLowerCase());
        producers.push({ name: clean, role: 'producer' });
      }
    }
  }

  // Extract writers from writer_artists
  if (song.writer_artists) {
    for (const writer of song.writer_artists) {
      const clean = cleanName(writer.name);
      if (clean && !seenWriters.has(clean.toLowerCase())) {
        seenWriters.add(clean.toLowerCase());
        writers.push({ name: clean, role: 'writer' });
      }
    }
  }

  // Check custom_performances for additional credits
  if (song.custom_performances) {
    for (const perf of song.custom_performances) {
      const label = perf.label.toLowerCase();
      if (/producer|produced/i.test(label)) {
        for (const a of perf.artists) {
          const clean = cleanName(a.name);
          if (clean && !seenProducers.has(clean.toLowerCase())) {
            seenProducers.add(clean.toLowerCase());
            producers.push({ name: clean, role: 'producer' });
          }
        }
      }
      if (/writer|songwriter|composed|lyrics/i.test(label)) {
        for (const a of perf.artists) {
          const clean = cleanName(a.name);
          if (clean && !seenWriters.has(clean.toLowerCase())) {
            seenWriters.add(clean.toLowerCase());
            writers.push({ name: clean, role: 'writer' });
          }
        }
      }
    }
  }

  console.log('Genius API found producers:', producers.map(p => p.name));
  console.log('Genius API found writers:', writers.map(w => w.name));

  return {
    title,
    artist,
    producers,
    writers,
    album: song.album?.name,
    releaseDate: song.release_date_for_display,
  };
}

async function lookupViaFirecrawl(
  title: string,
  artist: string,
  apiKey: string
): Promise<GeniusSongData | null> {
  const searchQuery = `site:genius.com "${artist}" "${title}" lyrics`;
  console.log('Searching Genius via Firecrawl:', searchQuery);

  const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: searchQuery,
      limit: 3,
      scrapeOptions: { formats: ['markdown'] },
    }),
  });

  if (!searchResponse.ok) {
    console.log('Genius Firecrawl search failed:', searchResponse.status);
    return null;
  }

  const searchData = await searchResponse.json();
  if (!searchData?.data?.length) {
    return null;
  }

  const songUrl = searchData.data.find((r: any) =>
    r.url?.includes('genius.com') &&
    r.url?.includes('-lyrics') &&
    !r.url?.includes('/albums/') &&
    !r.url?.includes('/artists/')
  )?.url;

  if (!songUrl) {
    console.log('No matching Genius song page found');
    return null;
  }

  console.log('Scraping Genius page:', songUrl);

  const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: songUrl,
      formats: ['markdown'],
      onlyMainContent: false,
      waitFor: 2000,
    }),
  });

  if (!scrapeResponse.ok) {
    console.log('Genius Firecrawl scrape failed:', scrapeResponse.status);
    return null;
  }

  const scrapeData = await scrapeResponse.json();
  const content = scrapeData?.data?.markdown || scrapeData?.markdown || '';

  console.log('Scraped content length:', content.length);

  const producers: Array<{ name: string; role: 'producer' }> = [];
  const writers: Array<{ name: string; role: 'writer' }> = [];
  const seenProducers = new Set<string>();
  const seenWriters = new Set<string>();

  const addUnique = (arr: Array<{ name: string; role: string }>, name: string, role: string, seen: Set<string>) => {
    const clean = cleanName(name);
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    arr.push({ name: clean, role } as any);
  };

  const producerPatterns = [
    /Produced\s+by\s+([^\n\[\]]+)/gi,
    /Producer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
    /\*\*Produced by\*\*\s*([^\n\[\]]+)/gi,
    /Production\s+by\s+([^\n\[\]]+)/gi,
    /Written\s*[&]\s*Produced\s+by\s+([^\n\[\]]+)/gi,
  ];

  for (const pattern of producerPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const names = match[1].split(/[,&]/).map(n => n.trim()).filter(n => n.length > 0);
      for (const n of names) {
        addUnique(producers, n, 'producer', seenProducers);
      }
    }
  }

  const writerPatterns = [
    /Written\s+by\s+([^\n\[\]]+)/gi,
    /Writer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
    /\*\*Written by\*\*\s*([^\n\[\]]+)/gi,
    /Songwriter[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
    /Lyrics\s+by\s+([^\n\[\]]+)/gi,
    /Lyricist[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
    /Composed\s+by\s+([^\n\[\]]+)/gi,
    /Composer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
    /Music\s+by\s+([^\n\[\]]+)/gi,
  ];

  for (const pattern of writerPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const names = match[1].split(/[,&]/).map(n => n.trim()).filter(n => n.length > 0);
      for (const n of names) {
        addUnique(writers, n, 'writer', seenWriters);
      }
    }
  }

  console.log('Firecrawl found producers:', producers);
  console.log('Firecrawl found writers:', writers);

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
