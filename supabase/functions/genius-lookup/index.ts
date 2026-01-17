const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeniusSongData {
  title: string;
  artist: string;
  producers: Array<{ name: string; role: 'producer' }>;
  writers: Array<{ name: string; role: 'writer' }>;
  album?: string;
  releaseDate?: string;
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

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search Genius for the song
    const searchQuery = `site:genius.com "${artist}" "${title}" lyrics`;
    console.log('Searching Genius:', searchQuery);

    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 3,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });

    if (!searchResponse.ok) {
      console.log('Genius search failed:', searchResponse.status);
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    console.log('Genius search results:', searchData?.data?.length || 0);

    if (!searchData?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the actual song page
    const songUrl = searchData.data.find((r: any) => 
      r.url?.includes('genius.com') && 
      r.url?.includes('-lyrics') &&
      !r.url?.includes('/albums/') &&
      !r.url?.includes('/artists/')
    )?.url;

    if (!songUrl) {
      console.log('No matching Genius song page found');
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scraping Genius page:', songUrl);

    // Scrape the Genius page for credits (markdown + structured JSON extraction)
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: songUrl,
        formats: [
          'markdown',
          {
            type: 'json',
            prompt: [
              'Extract song credits and metadata from this Genius song page.',
              'Return JSON with keys:',
              '- writers: string[] (songwriters/composers/lyricists)',
              '- producers: string[]',
              '- album: string | null',
              '- releaseDate: string | null (ISO if possible)',
              'Only include person names. Exclude organizations, section headings, and URLs.',
            ].join('\n'),
          },
        ],
      }),
    });

    if (!scrapeResponse.ok) {
      console.log('Genius scrape failed:', scrapeResponse.status);
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const content = scrapeData?.data?.markdown || scrapeData?.markdown || '';
    const extractedJson = scrapeData?.data?.json || scrapeData?.json || null;

    console.log('Scraped content length:', content.length);

    // Extract producers/writers (regex) + merge with structured extraction
    const producers: Array<{ name: string; role: 'producer' }> = [];
    const writers: Array<{ name: string; role: 'writer' }> = [];

    const addUnique = (arr: Array<{ name: string }>, name: string) => {
      const cleanName = String(name)
        .replace(/\*+/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanName) return;
      if (cleanName.length > 60) return;
      if (cleanName.includes('http')) return;

      const exists = arr.some((x) => x.name.toLowerCase() === cleanName.toLowerCase());
      if (!exists) arr.push({ name: cleanName } as any);
    };

    // Regex extraction from markdown
    const producerPatterns = [
      /Produced\s+by\s+([^\n\[\]]+)/gi,
      /Producer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /\*\*Produced by\*\*\s*([^\n\[\]]+)/gi,
      /Production\s+by\s+([^\n\[\]]+)/gi,
      /Written\s*[&]\s*Produced\s+by\s+([^\n\[\]]+)/gi,
      /\*\*Written\s*[&]\s*Produced by\*\*\s*([^\n\[\]]+)/gi,
    ];

    for (const pattern of producerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const names = match[1]
          .split(/[,&]/)
          .map((n) => n.trim())
          .filter((n) => n.length > 0);

        for (const n of names) {
          addUnique(producers as any, n);
        }
      }
    }

    const writerPatterns = [
      /Written\s+by\s+([^\n\[\]]+)/gi,
      /Writer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /\*\*Written by\*\*\s*([^\n\[\]]+)/gi,
      /Songwriter[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /Lyrics\s+by\s+([^\n\[\]]+)/gi,
      /\*\*Lyrics by\*\*\s*([^\n\[\]]+)/gi,
      /Lyricist[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /Composed\s+by\s+([^\n\[\]]+)/gi,
      /\*\*Composed by\*\*\s*([^\n\[\]]+)/gi,
      /Composer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /Music\s+by\s+([^\n\[\]]+)/gi,
      /\*\*Music by\*\*\s*([^\n\[\]]+)/gi,
      /Written\s*[&]\s*Produced\s+by\s+([^\n\[\]]+)/gi,
      /\*\*Written\s*[&]\s*Produced by\*\*\s*([^\n\[\]]+)/gi,
    ];

    for (const pattern of writerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const names = match[1]
          .split(/[,&]/)
          .map((n) => n.trim())
          .filter((n) => n.length > 0);

        for (const n of names) {
          addUnique(writers as any, n);
        }
      }
    }

    // Structured extraction merge (more reliable for pages that don't include "Written by" text in markdown)
    const jsonWriters: string[] = Array.isArray(extractedJson?.writers) ? extractedJson.writers : [];
    const jsonProducers: string[] = Array.isArray(extractedJson?.producers) ? extractedJson.producers : [];

    for (const name of jsonWriters) addUnique(writers as any, name);
    for (const name of jsonProducers) addUnique(producers as any, name);

    // Cast roles
    const finalWriters = writers.map((w) => ({ name: w.name, role: 'writer' as const }));
    const finalProducers = producers.map((p) => ({ name: p.name, role: 'producer' as const }));

    const album = typeof extractedJson?.album === 'string' ? extractedJson.album : undefined;
    const releaseDate = typeof extractedJson?.releaseDate === 'string' ? extractedJson.releaseDate : undefined;

    console.log('Found producers:', finalProducers);
    console.log('Found writers:', finalWriters);

    const result: GeniusSongData = {
      title,
      artist,
      producers: finalProducers,
      writers: finalWriters,
      album,
      releaseDate,
    };

    return new Response(
      JSON.stringify({ success: true, data: result }),
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