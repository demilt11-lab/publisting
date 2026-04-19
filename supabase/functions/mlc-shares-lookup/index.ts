import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ShareResult {
  name: string;             // Canonical (stage) name as supplied by caller
  share?: number;
  publisher?: string;
  role?: string;
  source?: string;
  collectingEntity?: string;
  matchedAs?: string;       // The exact name string we matched in the registry (legal name if different)
  matchType?: 'stage' | 'legal'; // Whether match was via stage name or legal/real name
}

interface WorkSharesResult {
  workTitle?: string;
  totalClaimedShares?: number;
  shares: ShareResult[];
  collectingPublishers?: CollectingPublisher[];
  contactEmails?: ContactEmail[];
}

interface CollectingPublisher {
  name: string;
  share?: number;
  territory?: string;
  source: string;
  role?: string;
}

interface ContactEmail {
  email: string;
  name?: string;
  role?: string;
  source: string;
}

const COLLECTING_ORGS = [
  'ASCAP', 'BMI', 'SESAC', 'GMR', 'The MLC', 'MLC', 'Harry Fox Agency', 'HFA',
  'SoundExchange',
  'SOCAN', 'CMRRA', 'SODRAC', 'Re:Sound',
  'PRS for Music', 'PRS', 'MCPS', 'PPL', 'GEMA', 'SACEM', 'SIAE', 'SGAE',
  'BUMA/STEMRA', 'BUMA', 'STEMRA', 'SABAM', 'TONO', 'STIM', 'KODA', 'TEOSTO',
  'AKM', 'SUISA', 'APRA AMCOS', 'APRA', 'AMCOS', 'IMRO', 'OSA',
  'JASRAC', 'KOMCA', 'MCSC', 'MÜST', 'CASH', 'COMPASS',
  'IPRS', 'PPL India',
  'SADAIC', 'ACINPRO', 'SACM', 'ABRAMUS', 'ECAD', 'UBC', 'SAYCO',
  'SAMRO', 'CAPASSO', 'MCSK', 'COSON',
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

function firecrawlScrape(apiKey: string, url: string, waitFor: number = 3000) {
  return fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor,
    }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);
}

/** Extract emails from scraped content */
function extractEmails(content: string): ContactEmail[] {
  const emailPattern = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const emails: ContactEmail[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = emailPattern.exec(content)) !== null) {
    const email = match[1].toLowerCase();
    // Skip obvious non-contact emails
    if (seen.has(email)) continue;
    if (/noreply|no-reply|donotreply|mailer-daemon|example\.com|test@|placeholder/i.test(email)) continue;
    seen.add(email);

    // Try to find context around the email
    const idx = match.index;
    const context = content.substring(Math.max(0, idx - 200), Math.min(content.length, idx + 200));

    let role = 'Contact';
    if (/a&r|ar@|ar\./i.test(context)) role = 'A&R';
    else if (/sync|licensing/i.test(context)) role = 'Sync/Licensing';
    else if (/manag/i.test(context)) role = 'Management';
    else if (/publish/i.test(context)) role = 'Publisher';
    else if (/booking|book@/i.test(context)) role = 'Booking';
    else if (/press|pr@|publicity/i.test(context)) role = 'Press/PR';
    else if (/info@|general|contact@/i.test(email)) role = 'General';

    // Try to extract name near email
    const nameMatch = context.match(/([A-Z][a-z]+ [A-Z][a-z]+)[\s,]*(?:[\-–|]|at\b)/);

    emails.push({
      email,
      name: nameMatch?.[1],
      role,
      source: 'SongView/MLC Registry',
    });
  }

  return emails;
}

/** Parse SongView page content for publishing data */
function parseSongViewData(content: string, writerNamesLower: string[]): {
  shares: Map<string, { share: number; source: string; publisher?: string }>;
  publishers: CollectingPublisher[];
  emails: ContactEmail[];
} {
  const shares = new Map<string, { share: number; source: string; publisher?: string }>();
  const publishers: CollectingPublisher[] = [];
  const seenPubs = new Set<string>();

  // SongView typically shows: Writer Name | Publisher | Share% | PRO
  const tableRowPattern = /([A-Z][A-Za-z\s'.,-]+?)\s*[|│]\s*([A-Z][A-Za-z\s&'.,-]*?)\s*[|│]\s*(\d{1,3}(?:\.\d{1,4})?)\s*%/g;
  let match;
  while ((match = tableRowPattern.exec(content)) !== null) {
    const writerName = match[1].trim();
    const pubName = match[2].trim();
    const shareVal = parseFloat(match[3]);
    if (shareVal <= 0 || shareVal > 100) continue;

    const writerLower = writerName.toLowerCase();
    for (const wn of writerNamesLower) {
      if (writerLower.includes(wn) || wn.includes(writerLower) ||
          writerLower.split(/\s+/).some(p => wn.includes(p) && p.length > 3)) {
        const origName = writerName;
        if (!shares.has(origName) || shares.get(origName)!.share < shareVal) {
          shares.set(origName, { share: shareVal, source: 'SongView', publisher: pubName || undefined });
        }
      }
    }

    if (pubName && pubName.length >= 3 && !COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) {
      const key = pubName.toLowerCase();
      if (!seenPubs.has(key)) {
        seenPubs.add(key);
        publishers.push({ name: pubName, share: shareVal, source: 'SongView' });
      }
    }
  }

  // Also extract "administered by" patterns
  const adminPattern = /(?:administered|collected|sub-published)\s+by\s+([A-Z][A-Za-z\s&'.,-]+?)(?:\s*[,|.\n(])/gi;
  let adminMatch;
  while ((adminMatch = adminPattern.exec(content)) !== null) {
    const pubName = adminMatch[1].trim();
    if (pubName.length < 3 || pubName.length > 80) continue;
    if (COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) continue;
    const key = pubName.toLowerCase();
    if (!seenPubs.has(key)) {
      seenPubs.add(key);
      publishers.push({ name: pubName, source: 'SongView', role: 'administrator' });
    }
  }

  const emails = extractEmails(content);

  return { shares, publishers, emails };
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cacheKey = `v3::${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;

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
    const writerNamesLower = (writerNames || []).map((n: string) => n.toLowerCase());

    // Launch all search strategies in parallel including SongView
    const [mlcResult, hfaResult, soundExResult, proResult, globalProResult, publisherCollectingResult, songViewResult] = await Promise.all([
      firecrawlSearch(apiKey, `${songQuery} (site:portal.themlc.com OR site:ascap.com/repertory) ownership shares percentage writer publisher`, 8),
      firecrawlSearch(apiKey, `${songQuery} ("Harry Fox Agency" OR "HFA" OR site:harryfox.com) publisher collecting mechanical rights percentage`, 5),
      firecrawlSearch(apiKey, `${songQuery} ("SoundExchange" OR site:soundexchange.com) rights owner featured artist percentage digital performance`, 5),
      firecrawlSearch(apiKey, `${songQuery} (site:repertoire.bmi.com OR site:sesac.com OR "GMR") publisher writer percentage shares`, 6),
      firecrawlSearch(apiKey, `${songQuery} ("PRS for Music" OR "GEMA" OR "JASRAC" OR "SOCAN" OR "SACEM" OR "SGAE" OR "KOMCA" OR "MCSC" OR "APRA AMCOS" OR "IPRS") publisher collecting shares percentage`, 6),
      firecrawlSearch(apiKey, `${songQuery} publisher collecting administration percentage share split "administered by" "collected by" "sub-published"`, 5),
      // NEW: SongView scraping for direct publishing data
      firecrawlSearch(apiKey, `${songQuery} site:songview.com OR site:songview.org publishing shares writer percentage affiliation`, 5),
    ]);

    // Also try direct SongView page scrape if we can build a URL
    const songViewSlug = `${songTitle} ${artist || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const songViewScrapePromise = firecrawlScrape(apiKey, `https://www.songview.org/search?q=${encodeURIComponent(`${songTitle} ${artist || ''}`)}`, 5000);

    const allContent: string[] = [];
    const sources: string[] = [];
    const allEmails: ContactEmail[] = [];

    const addResults = (result: any, sourceName: string) => {
      if (result?.data) {
        for (const r of result.data) {
          const text = r.markdown || r.description || '';
          allContent.push(text);
          // Extract emails from all sources
          allEmails.push(...extractEmails(text));
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
    addResults(songViewResult, 'SongView');

    // Process SongView direct scrape
    const songViewScrapeData = await songViewScrapePromise;
    let songViewParsed: ReturnType<typeof parseSongViewData> | null = null;
    if (songViewScrapeData?.data?.markdown || songViewScrapeData?.markdown) {
      const svContent = songViewScrapeData?.data?.markdown || songViewScrapeData?.markdown || '';
      if (svContent.length > 100) {
        allContent.push(svContent);
        sources.push('SongView Direct');
        songViewParsed = parseSongViewData(svContent, writerNamesLower);
        allEmails.push(...songViewParsed.emails);
      }
    }

    const fullContent = allContent.join('\n\n');
    console.log('Total content length:', fullContent.length, 'from sources:', sources);

    // ===== EXTRACT WRITER SHARES =====
    const shares: ShareResult[] = [];
    const foundShares = new Map<string, { share: number; source: string; publisher?: string; collectingEntity?: string }>();

    // Merge SongView parsed shares first (higher priority)
    if (songViewParsed) {
      for (const [name, info] of songViewParsed.shares) {
        foundShares.set(name, info);
      }
    }

    const normalizeForMatch = (name: string): string[] => {
      const parts = name.toLowerCase().trim().split(/\s+/);
      const combos = [parts.join(' ')];
      if (parts.length >= 2) {
        combos.push([parts[parts.length - 1], ...parts.slice(0, -1)].join(' '));
        combos.push(parts[parts.length - 1]);
      }
      return combos;
    };

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

    // Generic table patterns
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
    const collectingPublishers: CollectingPublisher[] = songViewParsed?.publishers ? [...songViewParsed.publishers] : [];
    const seenPublishers = new Set<string>(collectingPublishers.map(p => p.name.toLowerCase()));

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
        let pubName: string, shareVal: number;
        if (pattern === pubCollectingPatterns[2]) {
          shareVal = parseFloat(match[1]);
          pubName = match[2].trim();
        } else {
          pubName = match[1].trim();
          shareVal = parseFloat(match[2]);
        }

        if (shareVal <= 0 || shareVal > 100 || pubName.length < 3 || pubName.length > 80) continue;
        if (COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) continue;

        const key = pubName.toLowerCase();
        if (!seenPublishers.has(key)) {
          seenPublishers.add(key);
          collectingPublishers.push({ name: pubName, share: shareVal, source: 'Registry' });
        }
      }
    }

    const adminByPattern = /(?:administered|collected|sub-published|controlled)\s+by\s+([A-Z][A-Za-z\s&'.,-]+?)(?:\s*[,|.\n(])/gi;
    let adminMatch;
    while ((adminMatch = adminByPattern.exec(fullContent)) !== null) {
      const pubName = adminMatch[1].trim();
      if (pubName.length < 3 || pubName.length > 80) continue;
      if (COLLECTING_ORGS.some(org => pubName.toLowerCase() === org.toLowerCase())) continue;
      const key = pubName.toLowerCase();
      if (!seenPublishers.has(key)) {
        seenPublishers.add(key);
        collectingPublishers.push({ name: pubName, source: 'Registry', role: 'administrator' });
      }
    }

    // Detect referenced PROs
    const detectedOrgs = new Set<string>();
    for (const org of COLLECTING_ORGS) {
      const escaped = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(escaped, 'i').test(fullContent)) {
        detectedOrgs.add(org);
      }
    }

    let totalClaimedShares: number | undefined;
    const totalMatch = fullContent.match(/total\s+(?:claimed\s+)?shares?\s*[:\s]+(\d{1,3}(?:\.\d{1,4})?)\s*%/i);
    if (totalMatch) {
      totalClaimedShares = parseFloat(totalMatch[1]);
    }

    for (const [name, info] of foundShares) {
      shares.push({
        name,
        share: info.share,
        source: info.source,
        publisher: info.publisher,
        collectingEntity: info.collectingEntity,
      });
    }

    // Attach collecting org info
    for (const share of shares) {
      const writerLower = share.name.toLowerCase();
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

    // Deduplicate emails
    const uniqueEmails: ContactEmail[] = [];
    const seenEmails = new Set<string>();
    for (const e of allEmails) {
      if (!seenEmails.has(e.email)) {
        seenEmails.add(e.email);
        uniqueEmails.push(e);
      }
    }

    console.log('Found writer shares:', shares.length);
    console.log('Found collecting publishers:', collectingPublishers.length);
    console.log('Found contact emails:', uniqueEmails.length);
    console.log('Detected PROs/orgs:', Array.from(detectedOrgs));

    const result: WorkSharesResult = {
      workTitle: songTitle,
      totalClaimedShares,
      shares,
      collectingPublishers,
      contactEmails: uniqueEmails.length > 0 ? uniqueEmails : undefined,
    };

    const responseData = {
      success: true,
      data: result,
      sources,
      detectedOrgs: Array.from(detectedOrgs),
    };

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
