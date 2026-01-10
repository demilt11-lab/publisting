const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiscogsSongData {
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

    console.log('Discogs lookup for:', { title, artist });

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search Discogs for the release containing this track
    const searchQuery = `site:discogs.com "${artist}" "${title}"`;
    console.log('Searching Discogs:', searchQuery);

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
      console.log('Discogs search failed:', searchResponse.status);
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    console.log('Discogs search results:', searchData?.data?.length || 0);

    if (!searchData?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find a release page (not master, not artist page)
    const releaseUrl = searchData.data.find((r: any) => 
      r.url?.includes('discogs.com') && 
      (r.url?.includes('/release/') || r.url?.includes('/master/')) &&
      !r.url?.includes('/artist/')
    )?.url;

    if (!releaseUrl) {
      console.log('No matching Discogs release page found');
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      console.log('Discogs scrape failed:', scrapeResponse.status);
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const content = scrapeData?.data?.markdown || '';
    
    console.log('Scraped Discogs content length:', content.length);

    // Extract producers and writers from the page content
    const producers: Array<{ name: string; role: 'producer' }> = [];
    const writers: Array<{ name: string; role: 'writer' }> = [];

    // Discogs uses a Credits section with role - name format
    // Match patterns like "Producer – Name", "Produced By – Name"
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
          // Clean up the name
          const cleanName = name
            .replace(/\*+/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\(\d+\)/g, '') // Remove Discogs artist IDs like (123456)
            .trim();
          
          if (cleanName && cleanName.length > 1 && !producers.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
            producers.push({ name: cleanName, role: 'producer' });
          }
        }
      }
    }

    // Match patterns for writers/composers
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

    console.log('Discogs found producers:', producers);
    console.log('Discogs found writers:', writers);

    const result: DiscogsSongData = {
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
    console.error('Error in Discogs lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
