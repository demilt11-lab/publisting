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

// PRO database search URLs and parsers - Worldwide coverage
const PRO_DATABASES = [
  // North America
  { name: 'ASCAP', region: 'US', keywords: 'ASCAP American Society Composers' },
  { name: 'BMI', region: 'US', keywords: 'BMI Broadcast Music' },
  { name: 'SESAC', region: 'US', keywords: 'SESAC' },
  { name: 'The MLC', region: 'US', keywords: 'MLC Mechanical Licensing Collective' },
  { name: 'SOCAN', region: 'CA', keywords: 'SOCAN Society Composers Authors Music Publishers Canada' },
  
  // Europe
  { name: 'PRS', region: 'UK', keywords: 'PRS Performing Right Society UK' },
  { name: 'GEMA', region: 'DE', keywords: 'GEMA Germany' },
  { name: 'SACEM', region: 'FR', keywords: 'SACEM France' },
  { name: 'SIAE', region: 'IT', keywords: 'SIAE Italy' },
  { name: 'SGAE', region: 'ES', keywords: 'SGAE Spain' },
  
  // Asia Pacific
  { name: 'JASRAC', region: 'JP', keywords: 'JASRAC Japanese Society Rights Authors Composers' },
  { name: 'APRA AMCOS', region: 'AU', keywords: 'APRA AMCOS Australia' },
  { name: 'KOMCA', region: 'KR', keywords: 'KOMCA Korea Music Copyright Association' },
  { name: 'MCSC', region: 'CN', keywords: 'MCSC Music Copyright Society China' },
  
  // India
  { name: 'IPRS', region: 'IN', keywords: 'IPRS Indian Performing Right Society' },
  { name: 'PPL India', region: 'IN', keywords: 'PPL Phonographic Performance Limited India' },
  
  // Africa
  { name: 'SAMRO', region: 'ZA', keywords: 'SAMRO Southern African Music Rights Organisation' },
  { name: 'CAPASSO', region: 'ZA', keywords: 'CAPASSO Composers Authors Publishers Association South Africa' },
  { name: 'MCSK', region: 'KE', keywords: 'MCSK Music Copyright Society Kenya' },
  { name: 'COSON', region: 'NG', keywords: 'COSON Copyright Society Nigeria' },
  
  // Latin America
  { name: 'SACM', region: 'MX', keywords: 'SACM Sociedad Autores Compositores Mexico' },
  { name: 'SADAIC', region: 'AR', keywords: 'SADAIC Argentina' },
  { name: 'UBC', region: 'BR', keywords: 'UBC União Brasileira Compositores Brazil' },
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

    // Build comprehensive PRO search query
    const allProNames = PRO_DATABASES.map(p => p.name).join(' OR ');
    
    // Search for the song across all PRO databases at once
    const songSearchPromise = fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${searchQuery}" (${allProNames}) songwriter writer publisher IPI registered`,
        limit: 10,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // Also do a general web search for publishing info on each name with expanded PRO coverage
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
            query: `"${name}" music publisher publishing deal signed IPI (ASCAP OR BMI OR SESAC OR PRS OR GEMA OR SOCAN OR APRA OR JASRAC OR IPRS OR SAMRO OR SACM OR SACEM OR SIAE OR KOMCA) songwriter`,
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

    const [songSearchResult, nameSearchResults] = await Promise.all([
      songSearchPromise,
      Promise.all(nameSearchPromises),
    ]);

    // Parse song search results
    if (songSearchResult?.data) {
      const content = songSearchResult.data.map((r: any) => r.markdown || r.description || '').join('\n');
      
      for (const name of names) {
        if (content.toLowerCase().includes(name.toLowerCase())) {
          const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
          const publisherMatch = content.match(/(?:publisher|pub\.?)[:\s]*([A-Za-z\s&]+(?:Music|Publishing)?)/i);
          const proMatch = content.match(/\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN|APRA|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE)\b/i);
          
          if (!proResults[name]) {
            proResults[name] = { name };
          }
          if (ipiMatch) proResults[name].ipi = ipiMatch[1];
          if (publisherMatch) proResults[name].publisher = publisherMatch[1].trim();
          if (proMatch) proResults[name].pro = proMatch[1].toUpperCase();
        }
      }
    }

    // Parse results to extract publishing info
    for (const result of nameSearchResults) {
      if (!result?.data?.data) continue;

      const name = result.name;
      const content = result.data.data.map((r: any) => r.markdown || r.description || '').join('\n');
      
      // Try to extract publisher info from content - expanded PRO regex
      const publisherMatch = content.match(/(?:signed to|published by|publishing(?::|deal with)?)\s*([A-Za-z\s&]+(?:Music|Publishing|Entertainment))/i);
      const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
      const proMatch = content.match(/\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN|APRA|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE)\b/i);

      if (publisherMatch || ipiMatch || proMatch) {
        if (!proResults[name]) {
          proResults[name] = { name };
        }
        if (publisherMatch) proResults[name].publisher = publisherMatch[1].trim();
        if (ipiMatch) proResults[name].ipi = ipiMatch[1];
        if (proMatch) proResults[name].pro = proMatch[1].toUpperCase();
      }
    }

    console.log('PRO lookup results:', proResults);

    // Return list of all PROs searched
    const searchedPros = PRO_DATABASES.map(p => p.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: proResults,
        searched: searchedPros,
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
