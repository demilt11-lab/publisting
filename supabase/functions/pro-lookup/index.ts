const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProResult {
  name: string;
  ipi?: string;
  publisher?: string;
  pro?: string;
  role?: string;
}

// PRO database search URLs and parsers
const PRO_DATABASES = [
  {
    name: 'ASCAP',
    searchUrl: (query: string) => `https://www.ascap.com/repertory#/ace/search/workID/any/title/${encodeURIComponent(query)}/performer//writer//publisher//copyDate//classification//pages/1`,
    region: 'US',
  },
  {
    name: 'BMI',
    searchUrl: (query: string) => `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(query)}&Main_Search=Title&Search_Type=all`,
    region: 'US',
  },
  {
    name: 'SESAC',
    searchUrl: (query: string) => `https://www.sesac.com/#!/repertory/search?search=${encodeURIComponent(query)}`,
    region: 'US',
  },
  {
    name: 'PRS',
    searchUrl: (query: string) => `https://www.prsformusic.com/search/results?q=${encodeURIComponent(query)}`,
    region: 'UK',
  },
  {
    name: 'GEMA',
    searchUrl: (query: string) => `https://online.gema.de/werke/search.faces?searchText=${encodeURIComponent(query)}`,
    region: 'DE',
  },
  {
    name: 'The MLC',
    searchUrl: (query: string) => `https://portal.themlc.com/search?q=${encodeURIComponent(query)}`,
    region: 'US',
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { names, songTitle, artist } = await req.json();

    if (!names || !Array.isArray(names) || names.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Names array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('PRO lookup for:', { names, songTitle, artist });

    // Build search query combining song title and artist for better results
    const searchQuery = songTitle && artist ? `${songTitle} ${artist}` : songTitle || names[0];

    // Search across multiple PRO databases using Firecrawl's search
    const proResults: Record<string, ProResult> = {};

    // Use Firecrawl search to find publishing info across PRO databases
    const searchPromises = PRO_DATABASES.slice(0, 3).map(async (pro) => {
      try {
        console.log(`Searching ${pro.name} for: ${searchQuery}`);
        
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${searchQuery} site:${pro.name.toLowerCase()}.com OR site:${pro.name.toLowerCase()}.org writer publisher IPI`,
            limit: 5,
            scrapeOptions: {
              formats: ['markdown'],
            },
          }),
        });

        if (!response.ok) {
          console.log(`${pro.name} search failed:`, response.status);
          return null;
        }

        const data = await response.json();
        return { pro: pro.name, data };
      } catch (e) {
        console.log(`${pro.name} search error:`, e);
        return null;
      }
    });

    // Also do a general web search for publishing info on each name
    const nameSearchPromises = names.slice(0, 5).map(async (name: string) => {
      try {
        console.log(`Searching publishing info for: ${name}`);
        
        const response = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `"${name}" music publisher publishing deal signed IPI ASCAP BMI SESAC PRS GEMA songwriter`,
            limit: 5,
            scrapeOptions: {
              formats: ['markdown'],
            },
          }),
        });

        if (!response.ok) {
          console.log(`Search for ${name} failed:`, response.status);
          return null;
        }

        const data = await response.json();
        return { name, data };
      } catch (e) {
        console.log(`Search for ${name} error:`, e);
        return null;
      }
    });

    const [proSearchResults, nameSearchResults] = await Promise.all([
      Promise.all(searchPromises),
      Promise.all(nameSearchPromises),
    ]);

    // Parse results to extract publishing info
    for (const result of nameSearchResults) {
      if (!result?.data?.data) continue;

      const name = result.name;
      const content = result.data.data.map((r: any) => r.markdown || r.description || '').join('\n');
      
      // Try to extract publisher info from content
      const publisherMatch = content.match(/(?:signed to|published by|publishing(?::|deal with)?)\s*([A-Za-z\s&]+(?:Music|Publishing|Entertainment))/i);
      const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
      const proMatch = content.match(/\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN|APRA|JASRAC)\b/i);

      if (publisherMatch || ipiMatch || proMatch) {
        proResults[name] = {
          name,
          publisher: publisherMatch?.[1]?.trim(),
          ipi: ipiMatch?.[1],
          pro: proMatch?.[1]?.toUpperCase(),
        };
      }
    }

    // Process PRO database search results
    for (const result of proSearchResults) {
      if (!result?.data?.data) continue;

      for (const item of result.data.data) {
        const content = item.markdown || item.description || '';
        
        // Look for each name in the results
        for (const name of names) {
          if (content.toLowerCase().includes(name.toLowerCase())) {
            const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
            const publisherMatch = content.match(/(?:publisher|pub\.?)[:\s]*([A-Za-z\s&]+(?:Music|Publishing)?)/i);
            
            if (!proResults[name]) {
              proResults[name] = { name };
            }
            
            if (ipiMatch) proResults[name].ipi = ipiMatch[1];
            if (publisherMatch) proResults[name].publisher = publisherMatch[1].trim();
            proResults[name].pro = result.pro;
          }
        }
      }
    }

    console.log('PRO lookup results:', proResults);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: proResults,
        searched: PRO_DATABASES.slice(0, 3).map(p => p.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in PRO lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
