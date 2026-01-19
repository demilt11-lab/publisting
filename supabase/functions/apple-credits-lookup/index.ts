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
  } catch (e) {
    console.log('Failed to resolve geo URL, using original:', e);
  }
  return inputUrl;
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

/**
 * Parse comma/ampersand/slash-separated names from a line.
 */
function parseNamesFromLine(line: string): string[] {
  return line
    .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
    .map((s) => s.replace(/\[.*?\]|\(.*?\)/g, '').trim()) // strip bracketed annotations
    .filter((s) => s.length >= 2)
    .filter((s) => !/^https?:\/\//i.test(s))
    .filter((s) => !/^\d+$/.test(s)); // drop pure numbers (track indices, etc.)
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

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: resolvedUrl,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 3000, // Apple pages load dynamically
      }),
    });

    if (!scrapeResponse.ok) {
      const errText = await scrapeResponse.text();
      console.log('Apple credits scrape failed:', scrapeResponse.status, errText?.slice?.(0, 300));
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
    console.log('Apple markdown length:', markdown.length, 'chars');
    console.log('Apple markdown preview:', markdown.slice(0, 600));

    const writers: string[] = [];
    const producers: string[] = [];
    let album: string | null = null;
    let releaseDate: string | null = null;

    // Multi-line parsing: collect patterns across entire markdown
    const lines = markdown.split(/\r?\n/);

    // Pattern 1: Labeled credits lines (Writer(s): ..., Produced by ...)
    const writerLabels = /^(?:Writer\(?s?\)?|Songwriter\(?s?\)?|Written\s+by|Composed\s+by|Composer\(?s?\)?|Lyricist\(?s?\)?|Lyrics?\s+by)\s*[:\-–—]?\s*(.+)$/i;
    const producerLabels = /^(?:Producer\(?s?\)?|Produced\s+by|Production\s+by|Executive\s+Producer\(?s?\)?)\s*[:\-–—]?\s*(.+)$/i;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const writerMatch = line.match(writerLabels);
      if (writerMatch?.[1]) {
        writers.push(...parseNamesFromLine(writerMatch[1]));
      }

      const producerMatch = line.match(producerLabels);
      if (producerMatch?.[1]) {
        producers.push(...parseNamesFromLine(producerMatch[1]));
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
