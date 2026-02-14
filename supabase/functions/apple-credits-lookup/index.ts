const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AppleCreditsData = {
  writers: string[];
  producers: string[];
  album: string | null;
  releaseDate: string | null;
};

/**
 * Resolve geo.music.apple.com redirect URLs to the actual music.apple.com page.
 * Geo URLs typically 302-redirect to the localized page.
 */
async function resolveAppleUrl(inputUrl: string): Promise<string> {
  // If it's already a music.apple.com URL (not geo.), return as-is.
  if (!/geo\.music\.apple\.com/i.test(inputUrl)) {
    return inputUrl;
  }

  try {
    // HEAD request with redirect: 'manual' so we can capture the Location header.
    const resp = await fetch(inputUrl, { method: 'HEAD', redirect: 'manual' });
    const location = resp.headers.get('location');
    if (location && /music\.apple\.com/i.test(location)) {
      console.log('Resolved geo URL to:', location);
      return location;
    }
    // Try GET request as fallback (some redirects require full request)
    const getResp = await fetch(inputUrl, { method: 'GET', redirect: 'manual' });
    const getLocation = getResp.headers.get('location');
    if (getLocation && /music\.apple\.com/i.test(getLocation)) {
      console.log('Resolved geo URL via GET to:', getLocation);
      return getLocation;
    }
  } catch (e) {
    console.log('Failed to resolve geo URL, using original:', e);
  }
  return inputUrl;
}

/**
 * Scrape Apple Music page with retries for dynamic content.
 */
async function scrapeWithRetry(
  apiKey: string,
  url: string,
  maxRetries = 1
): Promise<{ markdown: string; success: boolean }> {
  // Single attempt with reasonable wait time
  const waitTimes = [5000, 8000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const waitFor = waitTimes[Math.min(attempt, waitTimes.length - 1)];
    console.log(`Apple scrape attempt ${attempt + 1}/${maxRetries + 1}, waitFor=${waitFor}ms`);

    try {
      const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: false,
          waitFor,
        }),
      });

      if (!scrapeResponse.ok) {
        const errText = await scrapeResponse.text();
        console.log(`Apple scrape attempt ${attempt + 1} failed:`, scrapeResponse.status, errText?.slice?.(0, 200));
        continue;
      }

      const scrapeData = await scrapeResponse.json();
      const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';

      // Check specifically for producer-related keywords (most commonly missing)
      const hasWriterCredits = /(?:writer|composer|songwriter|lyricist|written\s+by|composed\s+by)/i.test(markdown);
      const hasProducerCredits = /(?:producer|produced\s+by|production)/i.test(markdown);
      const hasCredits = hasWriterCredits || hasProducerCredits;
      
      console.log(`Apple scrape attempt ${attempt + 1}: ${markdown.length} chars, hasWriter=${hasWriterCredits}, hasProducer=${hasProducerCredits}`);
      
      if (markdown.length > 500 && hasCredits) {
        console.log(`Apple scrape attempt ${attempt + 1} succeeded with credits content`);
        return { markdown, success: true };
      } else if (markdown.length > 200 && attempt < maxRetries) {
        console.log(`Apple scrape attempt ${attempt + 1} got content but credits incomplete, retrying with longer wait...`);
      }
    } catch (e) {
      console.log(`Apple scrape attempt ${attempt + 1} exception:`, e);
    }
  }

  return { markdown: '', success: false };
}

/**
 * De-duplicate names (case-insensitive) while preserving original casing of first occurrence.
 */
function uniqNames(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = String(raw || '').trim();
    if (!s || s.length < 2) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Junk patterns to filter out - common non-name text found on Apple Music pages
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
  /apple\s+music/i,
  /itunes/i,
  /listen\s+now/i,
  /play\s+song/i,
  /add\s+to/i,
  /library/i,
  /playlist/i,
  /share/i,
  /copy\s+link/i,
  /more\s+by/i,
  /you\s+might/i,
  /similar\s+artists?/i,
  /related/i,
  /about\s+the\s+artist/i,
  /artist\s+bio/i,
  /sign\s+up/i,
  /log\s+in/i,
  /subscribe/i,
  /try\s+it\s+free/i,
  /get\s+3\s+months/i,
  /lossless/i,
  /dolby\s+atmos/i,
  /spatial\s+audio/i,
  /hi[- ]?res/i,
  /explicit/i,
  /clean/i,
  /℗|©|®|™/,
  /\d{4}\s+\w+\s+records/i,
  /inc\.|llc|ltd|corp/i,
  /all\s+rights/i,
  /under\s+license/i,
  /courtesy\s+of/i,
  /mixed\s+by/i,
  /mastered\s+by/i,
  /engineered\s+by/i,
  /recorded\s+at/i,
  /studio/i,
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
];

/**
 * Check if a name string is likely junk (not a real person's name).
 */
function isJunkName(name: string): boolean {
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
}

/**
 * Parse comma/ampersand/slash-separated names from a line.
 */
function parseNamesFromLine(line: string): string[] {
  return line
    .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
    .map((s) => {
      let clean = s
        .replace(/\[.*?\]|\(.*?\)/g, '') // strip bracketed annotations
        .replace(/["'""'']/g, '') // remove quotes
        .replace(/\s+/g, ' ')
        .trim();
      // Remove trailing punctuation
      clean = clean.replace(/[,;:.!?]+$/, '').trim();
      return clean;
    })
    .filter((s) => s.length >= 2)
    .filter((s) => !isJunkName(s));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve geo.music.apple.com redirects
    const resolvedUrl = await resolveAppleUrl(String(url).trim());
    console.log('Apple credits lookup (resolved):', resolvedUrl);

    // Scrape with retries for dynamic content
    const { markdown, success: scrapeSuccess } = await scrapeWithRetry(apiKey, resolvedUrl);
    
    if (!scrapeSuccess || markdown.length < 100) {
      console.log('Apple credits scrape failed after retries');
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Apple markdown length:', markdown.length, 'chars');
    console.log('Apple markdown preview:', markdown.slice(0, 800));

    const writers: string[] = [];
    const producers: string[] = [];
    let album: string | null = null;
    let releaseDate: string | null = null;

    // Multi-line parsing: collect patterns across entire markdown
    const lines = markdown.split(/\r?\n/);

    // Apple Music specific section headers - they use "Credits" as a section
    let inCreditsSection = false;
    let currentCreditType: 'writer' | 'producer' | null = null;

    // Pattern 1: Labeled credits lines (Writer(s): ..., Produced by ...)
    // Apple often uses formats like "Songwriter" or "Writers" as standalone headers
    const writerLabels = /^(?:Writer\(?s?\)?|Songwriter\(?s?\)?|Written\s+by|Composed\s+by|Composer\(?s?\)?|Lyricist\(?s?\)?|Lyrics?\s+by|Writing\s+Credits?|Song\s+Credits?)\s*[:\-–—]?\s*(.*)$/i;
    const producerLabels = /^(?:Producer\(?s?\)?|Produced\s+by|Production\s+by|Executive\s+Producer\(?s?\)?|Production\s+Credits?|Co[- ]?Producer\(?s?\)?|Additional\s+Production)\s*[:\-–—]?\s*(.*)$/i;
    const creditsHeader = /^(?:Credits?|Song\s+Credits?|Track\s+Credits?)$/i;
    const writerHeader = /^(?:Writer|Songwriter|Composer|Lyricist|Writing)s?$/i;
    const producerHeader = /^(?:Producer|Production|Produced)s?$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect "Credits" section header
      if (creditsHeader.test(line)) {
        inCreditsSection = true;
        currentCreditType = null;
        continue;
      }

      // Detect writer/producer section headers (standalone lines)
      if (writerHeader.test(line)) {
        currentCreditType = 'writer';
        inCreditsSection = true;
        continue;
      }
      if (producerHeader.test(line)) {
        currentCreditType = 'producer';
        inCreditsSection = true;
        continue;
      }

      // Exit credits section on new major section
      if (/^(?:More\s+By|You\s+Might\s+Also\s+Like|Related|Similar|Listen\s+Now)/i.test(line)) {
        inCreditsSection = false;
        currentCreditType = null;
        continue;
      }

      // If in credits section with a known type, treat lines as names
      if (inCreditsSection && currentCreditType) {
        // Skip navigation/UI text
        if (!/^(?:Play|Pause|Next|Previous|Share|Add|Remove|More|Show|Hide|©|℗|\d{4})/i.test(line) && line.length > 2 && line.length < 80) {
          const names = parseNamesFromLine(line);
          if (currentCreditType === 'writer') {
            writers.push(...names);
          } else if (currentCreditType === 'producer') {
            producers.push(...names);
          }
        }
      }

      // Pattern: Inline labeled credits (Writer(s): Name1, Name2)
      const writerMatch = line.match(writerLabels);
      if (writerMatch) {
        currentCreditType = 'writer';
        inCreditsSection = true;
        if (writerMatch[1]?.trim()) {
          writers.push(...parseNamesFromLine(writerMatch[1]));
        }
      }

      const producerMatch = line.match(producerLabels);
      if (producerMatch) {
        currentCreditType = 'producer';
        inCreditsSection = true;
        if (producerMatch[1]?.trim()) {
          producers.push(...parseNamesFromLine(producerMatch[1]));
        }
      }

      // Album detection: lines like "Album: locket" or "From the album locket"
      if (!album) {
        const albumMatch = line.match(/^(?:Album|From\s+the\s+album)\s*[:\-–—]?\s*(.+)$/i);
        if (albumMatch?.[1]) {
          album = albumMatch[1].trim();
        }
      }

      // Release date: "Released: January 16, 2026" or "Release Date: 2026-01-16"
      if (!releaseDate) {
        const dateMatch = line.match(/^(?:Released?|Release\s+Date)\s*[:\-–—]?\s*(.+)$/i);
        if (dateMatch?.[1]) {
          releaseDate = dateMatch[1].trim();
        }
      }
    }

    // Pattern 2: Look for credit blocks that span multiple lines (common on Apple Music)
    // e.g. "Songwriter\nName 1\nName 2" style
    const creditBlockPattern = /(?:Songwriter|Writer|Composer|Lyricist|Producer|Produced\s+by)s?[:\s]*\n((?:[^\n]+\n?)+?)(?=\n(?:Songwriter|Writer|Composer|Lyricist|Producer|Produced|Album|Release|©|\d{4}|$))/gi;
    let match: RegExpExecArray | null;
    while ((match = creditBlockPattern.exec(markdown)) !== null) {
      const blockHeader = match[0].toLowerCase();
      const blockContent = match[1] || '';
      const names = parseNamesFromLine(blockContent.replace(/\n/g, ', '));

      if (/producer|produced/i.test(blockHeader)) {
        producers.push(...names);
      } else {
        writers.push(...names);
      }
    }

    // Pattern 3: Inline credits like "Written by Madison Beer & Leroy Clampitt"
    const inlineWriters = markdown.match(/(?:Written|Composed|Lyrics?)\s+by\s+([A-Z][A-Za-z\s,&'.()-]+?)(?:\.|,(?:\s+and)?(?:\s+[A-Z])|[\n])/gi);
    if (inlineWriters) {
      for (const w of inlineWriters) {
        const m = w.match(/by\s+(.+)/i);
        if (m?.[1]) {
          writers.push(...parseNamesFromLine(m[1]));
        }
      }
    }

    const inlineProducers = markdown.match(/(?:Produced|Production)\s+by\s+([A-Z][A-Za-z\s,&'.()-]+?)(?:\.|,(?:\s+and)?(?:\s+[A-Z])|[\n])/gi);
    if (inlineProducers) {
      for (const p of inlineProducers) {
        const m = p.match(/by\s+(.+)/i);
        if (m?.[1]) {
          producers.push(...parseNamesFromLine(m[1]));
        }
      }
    }

    const data: AppleCreditsData = {
      writers: uniqNames(writers),
      producers: uniqNames(producers),
      album,
      releaseDate,
    };

    console.log('Apple credits extracted:', JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in apple-credits-lookup:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
