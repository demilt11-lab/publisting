const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProResult {
  name: string;
  ipi?: string;
  publisher?: string;
  recordLabel?: string;
  management?: string;
  pro?: string;
  role?: string;
  locationCountry?: string;
  locationName?: string;
}

// Map of country names/keywords to ISO codes
const COUNTRY_MAP: Record<string, { code: string; name: string }> = {
  // Common variations
  'united states': { code: 'US', name: 'United States' },
  'usa': { code: 'US', name: 'United States' },
  'u.s.': { code: 'US', name: 'United States' },
  'america': { code: 'US', name: 'United States' },
  'american': { code: 'US', name: 'United States' },
  'united kingdom': { code: 'GB', name: 'United Kingdom' },
  'uk': { code: 'GB', name: 'United Kingdom' },
  'britain': { code: 'GB', name: 'United Kingdom' },
  'british': { code: 'GB', name: 'United Kingdom' },
  'england': { code: 'GB', name: 'England' },
  'english': { code: 'GB', name: 'England' },
  'india': { code: 'IN', name: 'India' },
  'indian': { code: 'IN', name: 'India' },
  'canada': { code: 'CA', name: 'Canada' },
  'canadian': { code: 'CA', name: 'Canada' },
  'australia': { code: 'AU', name: 'Australia' },
  'australian': { code: 'AU', name: 'Australia' },
  'germany': { code: 'DE', name: 'Germany' },
  'german': { code: 'DE', name: 'Germany' },
  'france': { code: 'FR', name: 'France' },
  'french': { code: 'FR', name: 'France' },
  'japan': { code: 'JP', name: 'Japan' },
  'japanese': { code: 'JP', name: 'Japan' },
  'south korea': { code: 'KR', name: 'South Korea' },
  'korea': { code: 'KR', name: 'South Korea' },
  'korean': { code: 'KR', name: 'South Korea' },
  'nigeria': { code: 'NG', name: 'Nigeria' },
  'nigerian': { code: 'NG', name: 'Nigeria' },
  'south africa': { code: 'ZA', name: 'South Africa' },
  'brazil': { code: 'BR', name: 'Brazil' },
  'brazilian': { code: 'BR', name: 'Brazil' },
  'mexico': { code: 'MX', name: 'Mexico' },
  'mexican': { code: 'MX', name: 'Mexico' },
  'spain': { code: 'ES', name: 'Spain' },
  'spanish': { code: 'ES', name: 'Spain' },
  'italy': { code: 'IT', name: 'Italy' },
  'italian': { code: 'IT', name: 'Italy' },
  'china': { code: 'CN', name: 'China' },
  'chinese': { code: 'CN', name: 'China' },
  'sweden': { code: 'SE', name: 'Sweden' },
  'swedish': { code: 'SE', name: 'Sweden' },
  'norway': { code: 'NO', name: 'Norway' },
  'norwegian': { code: 'NO', name: 'Norway' },
  'netherlands': { code: 'NL', name: 'Netherlands' },
  'dutch': { code: 'NL', name: 'Netherlands' },
  'ireland': { code: 'IE', name: 'Ireland' },
  'irish': { code: 'IE', name: 'Ireland' },
  'jamaica': { code: 'JM', name: 'Jamaica' },
  'jamaican': { code: 'JM', name: 'Jamaica' },
  'puerto rico': { code: 'PR', name: 'Puerto Rico' },
  'puerto rican': { code: 'PR', name: 'Puerto Rico' },
  'argentina': { code: 'AR', name: 'Argentina' },
  'colombian': { code: 'CO', name: 'Colombia' },
  'colombia': { code: 'CO', name: 'Colombia' },
};

// Extract location from content
function extractLocation(content: string, name: string): { country?: string; location?: string } | null {
  const lowerContent = content.toLowerCase();
  const lowerName = name.toLowerCase();
  
  // Location patterns - look for "from [location]", "based in [location]", "[nationality] artist"
  const locationPatterns = [
    new RegExp(`${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*?(?:from|based in|hails from|born in|raised in|living in|residing in)\\s+([A-Za-z][A-Za-z\\s,]+?)(?:\\.|,|\\s+is|\\s+and|$)`, 'i'),
    new RegExp(`([A-Za-z]+)\\s+(?:singer|artist|musician|songwriter|producer|rapper|band)\\s+${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    new RegExp(`${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+is\\s+(?:an?\\s+)?([A-Za-z]+)\\s+(?:singer|artist|musician|songwriter|producer|rapper)`, 'i'),
  ];
  
  for (const pattern of locationPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const locationStr = match[1].trim().toLowerCase();
      
      // Check if we can map this to a country
      for (const [key, value] of Object.entries(COUNTRY_MAP)) {
        if (locationStr.includes(key)) {
          return { country: value.code, location: value.name };
        }
      }
      
      // Check for city names and map to countries
      const cityToCountry: Record<string, { code: string; name: string }> = {
        'los angeles': { code: 'US', name: 'Los Angeles, USA' },
        'new york': { code: 'US', name: 'New York, USA' },
        'atlanta': { code: 'US', name: 'Atlanta, USA' },
        'miami': { code: 'US', name: 'Miami, USA' },
        'chicago': { code: 'US', name: 'Chicago, USA' },
        'houston': { code: 'US', name: 'Houston, USA' },
        'london': { code: 'GB', name: 'London, UK' },
        'manchester': { code: 'GB', name: 'Manchester, UK' },
        'mumbai': { code: 'IN', name: 'Mumbai, India' },
        'delhi': { code: 'IN', name: 'Delhi, India' },
        'toronto': { code: 'CA', name: 'Toronto, Canada' },
        'lagos': { code: 'NG', name: 'Lagos, Nigeria' },
        'seoul': { code: 'KR', name: 'Seoul, South Korea' },
        'tokyo': { code: 'JP', name: 'Tokyo, Japan' },
        'paris': { code: 'FR', name: 'Paris, France' },
        'berlin': { code: 'DE', name: 'Berlin, Germany' },
        'sydney': { code: 'AU', name: 'Sydney, Australia' },
        'melbourne': { code: 'AU', name: 'Melbourne, Australia' },
        'arunachal pradesh': { code: 'IN', name: 'Arunachal Pradesh, India' },
        'northeast india': { code: 'IN', name: 'Northeast India' },
      };
      
      for (const [city, info] of Object.entries(cityToCountry)) {
        if (locationStr.includes(city)) {
          return { country: info.code, location: info.name };
        }
      }
    }
  }
  
  return null;
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
    const { names, songTitle, artist, filterPros } = await req.json();

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

    console.log('PRO lookup for:', { names, songTitle, artist, filterPros });

    // Search across multiple PRO databases using Firecrawl's search
    const proResults: Record<string, ProResult> = {};

    // Filter PROs if specified, otherwise use all
    const prosToSearch = filterPros && filterPros.length > 0 
      ? filterPros 
      : PRO_DATABASES.map(p => p.name);
    
    console.log('Searching PROs:', prosToSearch);
    
    // Strategy 1: Search for each person directly in ASCAP/BMI repertory databases
    const directSearchPromises = names.slice(0, 5).map(async (name: string) => {
      try {
        console.log(`Direct PRO search for: ${name}`);
        
        // Search ASCAP ACE database
        const ascapPromise = fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:ascap.com/repertory "${name}"`,
            limit: 3,
            scrapeOptions: { formats: ['markdown'] },
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        // Search BMI repertoire
        const bmiPromise = fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:bmi.com/search "${name}" songwriter`,
            limit: 3,
            scrapeOptions: { formats: ['markdown'] },
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        // General search for publisher, label, and management info
        const generalPromise = fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `"${name}" songwriter OR producer ("publishing" OR "record label" OR "management" OR "signed to" OR "IPI")`,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        // Search for record label info
        const labelPromise = fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `"${name}" artist ("record label" OR "signed to" OR "recording contract")`,
            limit: 3,
            scrapeOptions: { formats: ['markdown'] },
          }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        const [ascapData, bmiData, generalData, labelData] = await Promise.all([ascapPromise, bmiPromise, generalPromise, labelPromise]);
        
        return { name, ascapData, bmiData, generalData, labelData };
      } catch (e) {
        console.log(`Search for ${name} error:`, e);
        return { name, ascapData: null, bmiData: null, generalData: null, labelData: null };
      }
    });

    // Strategy 2: Search for song credits with PRO info
    const songSearchPromise = songTitle && artist ? fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${songTitle}" "${artist}" songwriter credits IPI ASCAP BMI SESAC PRS publisher`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);

    const [songSearchResult, ...directResults] = await Promise.all([
      songSearchPromise,
      ...directSearchPromises,
    ]);

    // Parse song search results
    if (songSearchResult?.data) {
      const content = songSearchResult.data.map((r: any) => r.markdown || r.description || '').join('\n');
      
      for (const name of names) {
        if (content.toLowerCase().includes(name.toLowerCase())) {
           const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
           const publisherMatch = content.match(/(?:publisher|pub\.?|published\s+by|publishing|signed\s+to)\s*[:\-]?\s*["']?([A-Z][A-Za-z0-9\s&'.,()\/-]{2,140}?(?:\s+(?:Music|Publishing|Entertainment|Songs|Tunes|Media|Group|LLC|Inc\.?|Ltd\.?|Limited|Holdings))?)["']?/i);
           const proMatch = content.match(/\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN|APRA|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE)\b/i);
          
           if (!proResults[name]) {
             proResults[name] = { name };
           }
           if (ipiMatch) proResults[name].ipi = ipiMatch[1];
           if (publisherMatch) proResults[name].publisher = publisherMatch[1].trim().replace(/[\s,.;:]+$/, '');
           if (proMatch) proResults[name].pro = proMatch[1].toUpperCase();
        }
      }
    }

    // Parse direct PRO search results
    for (const result of directResults) {
      if (!result) continue;

      const name = result.name;
      const allContent: string[] = [];
      
      // Collect content from all sources
      if (result.ascapData?.data) {
        allContent.push(...result.ascapData.data.map((r: any) => r.markdown || r.description || ''));
        // If found in ASCAP, mark as ASCAP member
        const ascapContent = result.ascapData.data.map((r: any) => r.markdown || '').join(' ');
        if (ascapContent.toLowerCase().includes(name.toLowerCase())) {
          if (!proResults[name]) proResults[name] = { name };
          if (!proResults[name].pro) proResults[name].pro = 'ASCAP';
        }
      }
      
      if (result.bmiData?.data) {
        allContent.push(...result.bmiData.data.map((r: any) => r.markdown || r.description || ''));
        // If found in BMI, mark as BMI member
        const bmiContent = result.bmiData.data.map((r: any) => r.markdown || '').join(' ');
        if (bmiContent.toLowerCase().includes(name.toLowerCase())) {
          if (!proResults[name]) proResults[name] = { name };
          if (!proResults[name].pro) proResults[name].pro = 'BMI';
        }
      }
      
      if (result.generalData?.data) {
        allContent.push(...result.generalData.data.map((r: any) => r.markdown || r.description || ''));
      }
      
      const content = allContent.join('\n');
      
      // Enhanced regex patterns for extracting info
      const ipiPatterns = [
        /IPI[:\s#]*(\d{9,11})/i,
        /IPI\s*(?:Number|No\.?|#)?\s*[:\s]*(\d{9,11})/i,
      ];
      
      // More specific publisher patterns - capture full company names
      const publisherPatterns = [
        // Direct publisher mentions with known keywords
        /(?:publishing(?:\s+(?:deal|admin|company))?|published\s+by|publishing\s+administered?\s+by)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+(?:Music|Publishing|Entertainment|Songs|Tunes|Media|Group|LLC|Inc\.?|Ltd\.?)?)/gi,
        /signed\s+(?:a\s+)?publishing\s+(?:deal\s+)?(?:with|to)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+)/gi,
        // Known major publishers
        /(Sony\s*\/?\s*ATV|Universal Music Publishing|Warner Chappell|Kobalt Music|BMG Rights|Downtown Music|Concord Music|Primary Wave|Hipgnosis|Spirit Music|Pulse Music|Reservoir Media|Big Deal Music|Anthem Entertainment|peermusic|UMPG|WCM|Prescription Songs|Roc Nation Publishing|TuneCore Publishing)/gi,
      ];

      // Record label patterns - capture full company names
      const labelPatterns = [
        /(?:record\s+label|signed\s+to|recording\s+(?:contract|deal)\s+(?:with|at)|releases?\s+(?:on|via|through)|distributed\s+by)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+(?:Records|Music|Entertainment|Recordings|Group)?)/gi,
        /(?:label)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+(?:Records|Music|Entertainment|Recordings))/gi,
        // Known major labels
        /(Universal Music|Sony Music|Warner Music|Atlantic Records|Columbia Records|Republic Records|Interscope|Def Jam|Capitol Records|Island Records|RCA Records|Epic Records|EMI|Virgin Records|Geffen Records|300 Entertainment|Quality Control|GOOD Music|Top Dawg|OVO Sound|XO Records|Young Money|Cash Money|Roc Nation|88rising)/gi,
      ];

      // Management patterns - capture full company names
      const managementPatterns = [
        /(?:managed?\s+by|management(?:\s+company)?)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+(?:Management|Entertainment|Group|Media)?)/gi,
        /(?:manager)[:\s]+["']?([A-Z][A-Za-z0-9\s&'.,()-]+)/gi,
        // Known major management companies
        /(Maverick Management|Full Stop Management|Roc Nation|Artist Partner Group|TaP Management|Shots Studios|First Access Entertainment|Red Light Management|Crush Management|Q Prime|McGhee Entertainment|Creative Artists Agency|William Morris|CAA|WME|UTA|ICM Partners)/gi,
      ];
      
      const proPattern = /\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN|APRA|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE)\b/gi;

      if (!proResults[name]) {
        proResults[name] = { name };
      }
      
      // Try to extract IPI
      for (const pattern of ipiPatterns) {
        const match = content.match(pattern);
        if (match && !proResults[name].ipi) {
          proResults[name].ipi = match[1];
          break;
        }
      }
      
      // Try to extract publisher
      for (const pattern of publisherPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(content);
        if (match && !proResults[name].publisher) {
           const pub = match[1].trim().replace(/[\s,.;:]+$/, ''); // Remove trailing punctuation/space
           // Validate it looks like a real publisher/company name
           if (pub.length > 3 && pub.length < 140 && /^[A-Z]/.test(pub)) {
             proResults[name].publisher = pub;
             break;
           }
        }
      }

      // Collect label content including dedicated label search
      let labelContent = content;
      if (result.labelData?.data) {
        labelContent += '\n' + result.labelData.data.map((r: any) => r.markdown || r.description || '').join('\n');
      }

      // Try to extract record label
      for (const pattern of labelPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(labelContent);
        if (match && !proResults[name].recordLabel) {
           const label = match[1].trim().replace(/[\s,.;:]+$/, '');
           if (label.length > 3 && label.length < 140 && /^[A-Z]/.test(label)) {
             proResults[name].recordLabel = label;
             break;
           }
        }
      }

      // Try to extract management
      for (const pattern of managementPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(content);
        if (match && !proResults[name].management) {
           const mgmt = match[1].trim().replace(/[\s,.;:]+$/, '');
           if (mgmt.length > 3 && mgmt.length < 140 && /^[A-Z]/.test(mgmt)) {
             proResults[name].management = mgmt;
             break;
           }
        }
      }
      
      // Try to extract PRO (find all mentions and pick most common)
      if (!proResults[name].pro) {
        const proMatches = content.match(proPattern);
        if (proMatches && proMatches.length > 0) {
          proResults[name].pro = proMatches[0].toUpperCase();
        }
      }
      
      // Try to extract location
      if (!proResults[name].locationCountry) {
        const locationInfo = extractLocation(content, name);
        if (locationInfo) {
          proResults[name].locationCountry = locationInfo.country;
          proResults[name].locationName = locationInfo.location;
        }
      }
    }

    console.log('PRO lookup results:', proResults);

    // Return list of PROs that were searched
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: proResults,
        searched: prosToSearch,
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
