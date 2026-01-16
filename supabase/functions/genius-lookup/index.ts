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

    // Scrape the Genius page for credits
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: songUrl,
        formats: ['markdown'],
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
    const content = scrapeData?.data?.markdown || '';
    
    console.log('Scraped content length:', content.length);

    // Extract producers from the page content
    const producers: Array<{ name: string; role: 'producer' }> = [];
    const writers: Array<{ name: string; role: 'writer' }> = [];

    // Match patterns like "Produced by Name", "Producers: Name, Name2"
    const producerPatterns = [
      /Produced\s+by\s+([^\n\[\]]+)/gi,
      /Producer[s]?\s*[:\-]\s*([^\n\[\]]+)/gi,
      /\*\*Produced by\*\*\s*([^\n\[\]]+)/gi,
      /Production\s+by\s+([^\n\[\]]+)/gi,
    ];

    for (const pattern of producerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const names = match[1]
          .split(/[,&]/)
          .map(n => n.trim())
          .filter(n => n.length > 0 && n.length < 50 && !n.includes('http'));
        
        for (const name of names) {
          // Clean up the name
          const cleanName = name
            .replace(/\*+/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanName && !producers.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
            producers.push({ name: cleanName, role: 'producer' });
          }
        }
      }
    }

    // Match patterns like "Written by Name", "Writers: Name, Name2", "Lyrics by", "Composed by"
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
      /\*\*Written & Produced by\*\*\s*([^\n\[\]]+)/gi,
    ];

    for (const pattern of writerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const names = match[1]
          .split(/[,&]/)
          .map(n => n.trim())
          .filter(n => n.length > 0 && n.length < 50 && !n.includes('http'));
        
        for (const name of names) {
          const cleanName = name
            .replace(/\*+/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanName && !writers.find(w => w.name.toLowerCase() === cleanName.toLowerCase())) {
            writers.push({ name: cleanName, role: 'writer' });
          }
        }
      }
    }

    // Also check for "Written & Produced by" pattern and add those names as both writers and producers
    const writtenAndProducedPattern = /Written\s*[&]\s*Produced\s+by\s+([^\n\[\]]+)/gi;
    let wpMatch;
    while ((wpMatch = writtenAndProducedPattern.exec(content)) !== null) {
      const names = wpMatch[1]
        .split(/[,&]/)
        .map(n => n.trim())
        .filter(n => n.length > 0 && n.length < 50 && !n.includes('http'));
      
      for (const name of names) {
        const cleanName = name
          .replace(/\*+/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanName && !producers.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
          producers.push({ name: cleanName, role: 'producer' });
        }
      }
    }

    console.log('Found producers:', producers);
    console.log('Found writers:', writers);

    const result: GeniusSongData = {
      title,
      artist,
      producers,
      writers,
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