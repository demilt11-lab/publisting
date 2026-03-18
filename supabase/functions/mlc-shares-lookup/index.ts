import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ShareResult {
  name: string;
  share?: number;
  publisher?: string;
  role?: string;
  source?: string;
  collectingEntity?: string;
}

interface WorkSharesResult {
  workTitle?: string;
  totalClaimedShares?: number;
  shares: ShareResult[];
  collectingPublishers?: CollectingPublisher[];
}

interface CollectingPublisher {
  name: string;
  share?: number;
  territory?: string;
  source: string;
  role?: string; // 'publisher' | 'administrator' | 'sub-publisher'
}

// Known collecting societies / PROs globally
const COLLECTING_ORGS = [
  // US
  'ASCAP', 'BMI', 'SESAC', 'GMR', 'The MLC', 'MLC', 'Harry Fox Agency', 'HFA',
  'SoundExchange',
  // Canada
  'SOCAN', 'CMRRA', 'SODRAC', 'Re:Sound',
  // UK / Europe
  'PRS for Music', 'PRS', 'MCPS', 'PPL', 'GEMA', 'SACEM', 'SIAE', 'SGAE',
  'BUMA/STEMRA', 'BUMA', 'STEMRA', 'SABAM', 'TONO', 'STIM', 'KODA', 'TEOSTO',
  'AKM', 'SUISA', 'APRA AMCOS', 'APRA', 'AMCOS', 'IMRO', 'OSA',
  // Asia
  'JASRAC', 'KOMCA', 'MCSC', 'MÜST', 'CASH', 'COMPASS',
  'IPRS', 'PPL India',
  // Latin America
  'SADAIC', 'ACINPRO', 'SACM', 'ABRAMUS', 'ECAD', 'UBC', 'SAYCO',
  // Africa
  'SAMRO', 'CAPASSO', 'MCSK', 'COSON',
  // Middle East
  'ACUM',
];

function firecrawlSearch(apiKey: string, query: string, limit: number = 5) {
  return fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: { formats: ['markdown'] },
    }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);
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
    const cacheKey = `v2::${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;

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

    console.log('Publishing shares lookup for:', songTitle, 'by', artist);

    const songQuery = `"${songTitle}" ${artist ? `"${artist}"` : ''}`;

    // Launch all search strategies in parallel
    const [mlcResult, hfaResult, soundExResult, proResult, globalProResult, publisherCollectingResult] = await Promise.all([
      // Strategy 1: MLC + ASCAP repertory
      firecrawlSearch(apiKey, `${songQuery} (site:portal.themlc.com OR site:ascap.com/repertory) ownership shares percentage writer publisher`, 8),

      // Strategy 2: Harry Fox Agency / HFA
      firecrawlSearch(apiKey, `${songQuery} ("Harry Fox Agency" OR "HFA" OR site:harryfox.com) publisher collecting mechanical rights percentage`, 5),

      // Strategy 3: SoundExchange
      firecrawlSearch(apiKey, `${songQuery} ("SoundExchange" OR site:soundexchange.com) rights owner featured artist percentage digital performance`, 5),

      // Strategy 4: BMI + SESAC + GMR
      firecrawlSearch(apiKey, `${songQuery} (site:repertoire.bmi.com OR site:sesac.com OR "GMR") publisher writer percentage shares`, 6),

      // Strategy 5: Global PROs (PRS, GEMA, JASRAC, SOCAN, SACEM, KOMCA, etc.)
      firecrawlSearch(apiKey, `${songQuery} ("PRS for Music" OR "GEMA" OR "JASRAC" OR "SOCAN" OR "SACEM" OR "SGAE" OR "KOMCA" OR "MCSC" OR "APRA AMCOS" OR "IPRS") publisher collecting shares percentage`, 6),

      // Strategy 6: General publisher collecting / admin search
      firecrawlSearch(apiKey, `${songQuery} publisher collecting administration percentage share split "administered by" "collected by" "sub-published"`, 5),
    ]);

    // Combine all content
    const allContent: string[] = [];
    const sources: string[] = [];

    const addResults = (result: any, sourceName: string) => {
      if (result?.data) {
        for (const r of result.data) {
          allContent.push(r.markdown || r.description || '');
        }
        sources.push(sourceName);
      }
    };

    addResults(mlcResult, 'MLC/ASCAP');
    addResults(hfaResult, 'HFA');
    addResults(soundExResult, 'SoundExchange');
    addResults(proResult, 'BMI/SESAC/GMR');
    addResults(globalProResult, 'Global PROs');
    addResults(publisherCollectingResult, 'Publisher/Admin');

    const fullContent = allContent.join('\n\n');
    console.log('Total content length:', fullContent.length, 'from sources:', sources);

    // ===== EXTRACT WRITER SHARES =====
    const shares: ShareResult[] = [];
    const foundShares = new Map<string, { share: number; source: string; publisher?: string; collectingEntity?: string }>();
    const writerNamesLower = (writerNames || []).map((n: string) => n.toLowerCase());

    const normalizeForMatch = (name: string): string[] => {
      const parts = name.toLowerCase().trim().split(/\s+/);
      const combos = [parts.join(' ')];
      if (parts.length >= 2) {
        combos.push([parts[parts.length - 1], ...parts.slice(0, -1)].join(' '));
        combos.push(parts[parts.length - 1]);
      }
      return combos;
    };

    // Search for percentage near writer names
    for (const writerName of writerNamesLower) {
      const nameCombos = normalizeForMatch(writerName);
      for (const combo of nameCombos) {
        if (combo.length < 4) continue;
        const escapedName = combo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            const originalName = (writerNames || []).find((n: string) => n.toLowerCase() === writerName) || writerName;
            if (!foundShares.has(originalName)) {
              foundShares.set(originalName, { share: shareVal, source: 'MLC' });
            }
          }
        }
      }
    }

    // Generic table patterns for shares
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
        if (shareVal <= 0 || shareVal > 100 || rawName.length < 3 || rawName.length > 60) continue;

        const rawNameLower = rawName.toLowerCase();
        for (const writerName of writerNamesLower) {
          const nameCombos = normalizeForMatch(writerName);
          const rawCombos = normalizeForMatch(rawNameLower);
          const isMatch = nameCombos.some(c => rawCombos.some(rc => rc.includes(c) || c.includes(rc)));

          if (isMatch) {
            const originalName = (writerNames || []).find((n: string) => n.toLowerCase() === writerName) || rawName;
            if (!foundShares.has(originalName) || foundShares.get(originalName)!.share < shareVal) {
              foundShares.set(originalName, { share: shareVal, source: 'MLC' });
            }
          }
        }
      }
    }

    // ===== EXTRACT COLLECTING PUBLISHERS =====
    const collectingPublishers: CollectingPublisher[] = [];
    const seenPublishers = new Set<string>();

    // Pattern: "Publisher Name" collecting/administering XX%
    const pubCollectingPatterns = [
      /([A-Z][A-Za-z\s&'.,-]+?)\s*(?:collecting|administering|controls?|owns?|claiming)\s*(?:[\s:]+)?(\d{1,3}(?:\.\d{1,4})?)\s*%/gi,
      /(?:publisher|admin(?:istrator)?|collecting\s+entity|sub-publisher)\s*[:\s|│]+\s*([A-Z][A-Za-z\s&'.,-]+?)[\s|│]+(\d{1,3}(?:\.\d{1,4})?)\s*%/gi,
      /(\d{1,3}(?:\.\d{1,4})?)\s*%\s*(?:collected|administered|controlled)\s+by\s+([A-Z][A-Za-z\s&'.,-]+?)(?:\s*[,|.\n])/gi,
      /([A-Z][A-Za-z\s&'.,-]+?)\s*\(\s*(?:publisher|admin)\s*\)\s*[:\s-]*(\d{1,3}(?:\.\d{1,4})?)\s*%/gi,
    ];

    for (const pattern of pubCollectingPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(fullContent)) !== null) {
        // Handle reversed capture groups (pattern 3)
        let pubName: string, shareVal: number;
        if (pattern === pubCollectingPatterns[2]) {
          shareVal = parseFloat(match[1]);
          pubName = match[2].trim();
        } else {
          pubName = match[1].trim();
          shareVal = parseFloat(match[2]);
        }

        if (shareVal <= 0 || shareVal > 100 || pubName.length < 3 || pubName.length > 80) continue;
        // Skip if it's a collecting org name itself
        if (COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) continue;

        const key = pubName.toLowerCase();
        if (!seenPublishers.has(key)) {
          seenPublishers.add(key);
          collectingPublishers.push({
            name: pubName,
            share: shareVal,
            source: 'Registry',
          });
        }
      }
    }

    // Pattern: "administered by Publisher Name" (no percentage)
    const adminByPattern = /(?:administered|collected|sub-published|controlled)\s+by\s+([A-Z][A-Za-z\s&'.,-]+?)(?:\s*[,|.\n(])/gi;
    let adminMatch;
    while ((adminMatch = adminByPattern.exec(fullContent)) !== null) {
      const pubName = adminMatch[1].trim();
      if (pubName.length < 3 || pubName.length > 80) continue;
      if (COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) continue;
      const key = pubName.toLowerCase();
      if (!seenPublishers.has(key)) {
        seenPublishers.add(key);
        collectingPublishers.push({
          name: pubName,
          source: 'Registry',
          role: 'administrator',
        });
      }
    }

    // Detect which PROs/collecting societies are referenced for this work
    const detectedOrgs = new Set<string>();
    for (const org of COLLECTING_ORGS) {
      const escaped = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(escaped, 'i').test(fullContent)) {
        detectedOrgs.add(org);
      }
    }

    // Look for total shares
    let totalClaimedShares: number | undefined;
    const totalMatch = fullContent.match(/total\s+(?:claimed\s+)?shares?\s*[:\s]+(\d{1,3}(?:\.\d{1,4})?)\s*%/i);
    if (totalMatch) {
      totalClaimedShares = parseFloat(totalMatch[1]);
    }

    // Convert writer shares to results
    for (const [name, info] of foundShares) {
      shares.push({
        name,
        share: info.share,
        source: info.source,
        publisher: info.publisher,
        collectingEntity: info.collectingEntity,
      });
    }

    // Attach collecting org info to writer shares where possible
    for (const share of shares) {
      const writerLower = share.name.toLowerCase();
      // Find nearby collecting org mentions
      for (const org of detectedOrgs) {
        const escaped = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const writerEscaped = writerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nearbyOrgPattern = new RegExp(`${writerEscaped}[^\\n]{0,300}?${escaped}`, 'i');
        if (nearbyOrgPattern.test(fullContent)) {
          share.source = org;
          break;
        }
      }
    }

    console.log('Found writer shares:', shares.length);
    console.log('Found collecting publishers:', collectingPublishers.length);
    console.log('Detected PROs/orgs:', Array.from(detectedOrgs));

    const result: WorkSharesResult = {
      workTitle: songTitle,
      totalClaimedShares,
      shares,
      collectingPublishers,
    };

    const responseData = {
      success: true,
      data: result,
      sources,
      detectedOrgs: Array.from(detectedOrgs),
    };

    // Cache the result
    await supabase
      .from('mlc_shares_cache')
      .upsert({
        cache_key: cacheKey,
        data: responseData,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' })
      .then(() => console.log('Shares cached for:', cacheKey))
      .catch((e: Error) => console.error('Cache write failed:', e));

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Publishing shares lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup shares' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
