import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShareResult {
  name: string;
  share?: number;
  publisher?: string;
  role?: string;
  source?: string;
}

interface WorkSharesResult {
  workTitle?: string;
  totalClaimedShares?: number;
  shares: ShareResult[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songTitle, artist, writerNames } = await req.json();

    if (!songTitle) {
      return new Response(
        JSON.stringify({ success: false, error: 'Song title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cacheKey = `${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;

    const { data: cached } = await supabase
      .from('mlc_shares_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      console.log('MLC shares cache hit for:', cacheKey);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('MLC shares lookup for:', songTitle, 'by', artist);

    const shares: ShareResult[] = [];

    // Strategy 1: Search MLC + ASCAP for ownership shares
    const mlcSearchPromise = fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${songTitle}" ${artist ? `"${artist}"` : ''} (site:portal.themlc.com OR site:ascap.com/repertory) ownership shares percentage writer`,
        limit: 8,
        scrapeOptions: { formats: ['markdown'] },
      }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // Strategy 2: General web search for publishing splits
    const generalSearchPromise = fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${songTitle}" ${artist ? `"${artist}"` : ''} publishing share split percentage songwriter credits ownership`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const [mlcResult, generalResult] = await Promise.all([
      mlcSearchPromise,
      generalSearchPromise,
    ]);

    // Combine all content
    const allContent: string[] = [];
    const sources: string[] = [];

    if (mlcResult?.data) {
      for (const r of mlcResult.data) {
        allContent.push(r.markdown || r.description || '');
      }
      sources.push('MLC/ASCAP');
    }

    if (generalResult?.data) {
      for (const r of generalResult.data) {
        allContent.push(r.markdown || r.description || '');
      }
      sources.push('Web');
    }

    const fullContent = allContent.join('\n\n');
    console.log('Total content length:', fullContent.length, 'from sources:', sources);

    const foundShares = new Map<string, { share: number; source: string; publisher?: string }>();

    // Debug: log any percentage patterns we find near writer names
    const writerNamesLower = (writerNames || []).map((n: string) => n.toLowerCase());
    
    // Build flexible name matching function
    const normalizeForMatch = (name: string): string[] => {
      const parts = name.toLowerCase().trim().split(/\s+/);
      // Return various orderings: "first last", "last first", individual parts
      const combos = [parts.join(' ')];
      if (parts.length >= 2) {
        combos.push([parts[parts.length - 1], ...parts.slice(0, -1)].join(' ')); // last first
        combos.push(parts[parts.length - 1]); // last name only
      }
      return combos;
    };

    // First, search for any percentage near any writer name in the content
    for (const writerName of writerNamesLower) {
      const nameCombos = normalizeForMatch(writerName);
      for (const combo of nameCombos) {
        if (combo.length < 4) continue;
        const escapedName = combo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Look for the name within ~200 chars of a percentage
        const nearbyPattern = new RegExp(
          `${escapedName}[^%]{0,200}?(\\d{1,3}(?:\\.\\d{1,4})?)\\s*%`,
          'gi'
        );
        const reversePattern = new RegExp(
          `(\\d{1,3}(?:\\.\\d{1,4})?)\\s*%[^\\n]{0,200}?${escapedName}`,
          'gi'
        );
        
        let match = nearbyPattern.exec(fullContent);
        if (match) {
          const shareVal = parseFloat(match[1]);
          if (shareVal > 0 && shareVal <= 100) {
            console.log(`Found share near "${combo}": ${shareVal}%`);
            const originalName = (writerNames || []).find((n: string) => n.toLowerCase() === writerName) || writerName;
            if (!foundShares.has(originalName) || foundShares.get(originalName)!.share < shareVal) {
              foundShares.set(originalName, { share: shareVal, source: 'MLC' });
            }
          }
        }
        
        match = reversePattern.exec(fullContent);
        if (match && !foundShares.has(writerName)) {
          const shareVal = parseFloat(match[1]);
          if (shareVal > 0 && shareVal <= 100) {
            console.log(`Found share before "${combo}": ${shareVal}%`);
            const originalName = (writerNames || []).find((n: string) => n.toLowerCase() === writerName) || writerName;
            if (!foundShares.has(originalName)) {
              foundShares.set(originalName, { share: shareVal, source: 'MLC' });
            }
          }
        }
      }
    }

    // Also try generic table patterns
    const nameSharePatterns = [
      /([A-Z][A-Za-z\s'.,-]+?)\s*[|│]\s*(?:Writer|Author|Composer|Lyricist|Arranger|Publisher|Administrator)?\s*[|│]?\s*(\d{1,3}(?:\.\d{1,4})?)\s*%/g,
      /([A-Z][A-Za-z\s'.,-]+?)\s*\((\d{1,3}(?:\.\d{1,4})?)\s*%\)/g,
      /([A-Z][A-Za-z\s'.,-]+?)\s*[:\-–]\s*(\d{1,3}(?:\.\d{1,4})?)\s*%/g,
    ];

    for (const pattern of nameSharePatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(fullContent)) !== null) {
        const rawName = match[1].trim();
        const shareVal = parseFloat(match[2]);
        
        if (shareVal <= 0 || shareVal > 100) continue;
        if (rawName.length < 3 || rawName.length > 60) continue;
        
        const rawNameLower = rawName.toLowerCase();
        for (const writerName of writerNamesLower) {
          const nameCombos = normalizeForMatch(writerName);
          const rawCombos = normalizeForMatch(rawNameLower);
          
          const isMatch = nameCombos.some(c => rawCombos.some(rc => 
            rc.includes(c) || c.includes(rc)
          ));
          
          if (isMatch) {
            const originalName = (writerNames || []).find((n: string) => n.toLowerCase() === writerName) || rawName;
            if (!foundShares.has(originalName) || foundShares.get(originalName)!.share < shareVal) {
              foundShares.set(originalName, { share: shareVal, source: 'MLC' });
            }
          }
        }
      }
    }

    // Look for total shares
    let totalClaimedShares: number | undefined;
    const totalMatch = fullContent.match(/total\s+(?:claimed\s+)?shares?\s*[:\s]+(\d{1,3}(?:\.\d{1,4})?)\s*%/i);
    if (totalMatch) {
      totalClaimedShares = parseFloat(totalMatch[1]);
    }

    // Convert to results array
    for (const [name, info] of foundShares) {
      shares.push({
        name,
        share: info.share,
        source: info.source,
        publisher: info.publisher,
      });
    }

    console.log('Found shares:', shares);

    const result: WorkSharesResult = {
      workTitle: songTitle,
      totalClaimedShares,
      shares,
    };

    const responseData = { success: true, data: result, sources };

    // Cache the result
    await supabase
      .from('mlc_shares_cache')
      .upsert({
        cache_key: cacheKey,
        data: responseData,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' })
      .then(() => console.log('MLC shares cached for:', cacheKey))
      .catch((e: Error) => console.error('Cache write failed:', e));

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('MLC shares lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup shares' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
