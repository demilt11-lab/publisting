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

    // Scrape the Genius page for credits.
    // NOTE: Firecrawl JSON extraction can intermittently 400 on some pages.
    // We rely on markdown + robust regex parsing for reliability.
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
      console.log('Genius scrape failed:', scrapeResponse.status);
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const content = scrapeData?.data?.markdown || scrapeData?.markdown || '';

    console.log('Scraped content length:', content.length);

    // Extract producers/writers (regex) + merge with structured extraction
    const producers: Array<{ name: string; role: 'producer' }> = [];
    const writers: Array<{ name: string; role: 'writer' }> = [];

    // Junk patterns to filter out - common non-name text found on Genius pages
    const junkPatterns = [
      /frequent\s+collaborator/i,
      /long[- ]?time/i,
      /worked\s+with/i,
      /known\s+for/i,
      /also\s+known/i,
      /previously/i,
      /according\s+to/i,
      /credits?\s+include/i,
      /has\s+produced/i,
      /has\s+written/i,
      /best\s+known/i,
      /notable/i,
      /grammy/i,
      /award[- ]?winning/i,
      /multi[- ]?platinum/i,
      /billboard/i,
      /chart[- ]?topping/i,
      /hit\s+song/i,
      /number[- ]?one/i,
      /top\s+\d+/i,
      /million\s+copies/i,
      /record\s+label/i,
      /signed\s+to/i,
      /management/i,
      /booking/i,
      /contact/i,
      /email/i,
      /follow\s+on/i,
      /social\s+media/i,
      /twitter|instagram|facebook|tiktok/i,
      /official\s+website/i,
      /read\s+more/i,
      /see\s+all/i,
      /view\s+all/i,
      /show\s+more/i,
      /expand/i,
      /collapse/i,
      /lyrics\s+provided/i,
      /genius\s+annotation/i,
      /verified\s+artist/i,
      /about\s+genius/i,
      /sign\s+up/i,
      /log\s+in/i,
      /subscribe/i,
      /community/i,
      /contributors/i,
      /transcriber/i,
      /editor/i,
      /moderator/i,
      /iq\s+points/i,
      /song\s+bio/i,
      /track\s+info/i,
      /release\s+date/i,
      /recording\s+location/i,
      /studio/i,
      /mixed\s+by/i,
      /mastered\s+by/i,
      /engineered\s+by/i,
      /assistant\s+engineer/i,
      /additional\s+production/i,
      /executive\s+producer/i,
      /co[- ]?producer/i,
      /vocal\s+producer/i,
      /programming/i,
      /keyboards?/i,
      /guitar/i,
      /drums?/i,
      /bass/i,
      /strings?/i,
      /horns?/i,
      /backing\s+vocals?/i,
      /background\s+vocals?/i,
      /featuring/i,
      /feat\.?/i,
      /ft\.?/i,
      /remix/i,
      /version/i,
      /original/i,
      /sample/i,
      /interpolat/i,
      /contains?\s+sample/i,
      /courtesy\s+of/i,
      /under\s+license/i,
      /copyright/i,
      /all\s+rights/i,
      /published\s+by/i,
      /administered/i,
      /®|™|©|℗/,
      /\d{4}\s+\w+\s+records/i,
      /inc\.|llc|ltd|corp/i,
    ];

    const isJunkName = (name: string): boolean => {
      const lower = name.toLowerCase();
      // Too short or too long
      if (name.length < 2 || name.length > 50) return true;
      // Contains URLs
      if (/https?:\/\//i.test(name)) return true;
      // Pure numbers or dates
      if (/^\d+$/.test(name) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(name)) return true;
      // Check junk patterns
      for (const pattern of junkPatterns) {
        if (pattern.test(name)) return true;
      }
      // Looks like a sentence (too many words, has common verbs)
      const words = name.split(/\s+/);
      if (words.length > 5) return true;
      if (/\b(is|was|are|were|has|have|had|the|a|an|and|or|but|for|with|from|to|of|in|on|at|by)\b/i.test(lower) && words.length > 3) return true;
      // Starts with common non-name words
      if (/^(the|a|an|this|that|these|those|some|any|all|no|not|very|more|most|also|just|only|even|still)\s/i.test(name)) return true;
      return false;
    };

    const addUnique = (arr: Array<{ name: string }>, name: string) => {
      let cleanName = String(name)
        .replace(/\*+/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '') // Remove parenthetical notes
        .replace(/["'""'']/g, '') // Remove quotes
        .replace(/\s+/g, ' ')
        .trim();

      // Remove trailing punctuation and common suffixes
      cleanName = cleanName
        .replace(/[,;:.!?]+$/, '')
        .replace(/\s+(and|&)\s*$/i, '')
        .trim();

      if (!cleanName || isJunkName(cleanName)) return;

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

    // Cast roles
    const finalWriters = writers.map((w) => ({ name: w.name, role: 'writer' as const }));
    const finalProducers = producers.map((p) => ({ name: p.name, role: 'producer' as const }));

    // Album / release date are optional; we don't depend on them for credits.
    const album = undefined;
    const releaseDate = undefined;

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