const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SpotifyCreditsData = {
  writers: string[];
  producers: string[];
  performedBy: string[];
};

/**
 * Scrape Spotify credits page using Firecrawl.
 * Spotify exposes credits at https://open.spotify.com/track/{id}/credits
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trackId, url } = await req.json();

    // Accept either a trackId or a full Spotify URL
    let spotifyTrackId = trackId;
    if (!spotifyTrackId && url) {
      const m = String(url).match(/\/track\/([a-zA-Z0-9]+)/);
      if (m) spotifyTrackId = m[1];
    }

    if (!spotifyTrackId) {
      return new Response(
        JSON.stringify({ success: false, error: 'trackId or url is required' }),
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

    // Try multiple regional URLs to handle region-gated content
    const baseUrl = `https://open.spotify.com/track/${spotifyTrackId}/credits`;
    const regionUrls = [
      baseUrl,
      `https://open.spotify.com/intl-en/track/${spotifyTrackId}/credits`, // International English
      `https://open.spotify.com/intl-de/track/${spotifyTrackId}/credits`, // German
      `https://open.spotify.com/embed/track/${spotifyTrackId}`, // Embed version sometimes has credits
    ];

    let markdown = '';
    let scrapeSuccess = false;

    // Increased wait times for dynamic content loading
    const waitTimes = [4000, 6000, 8000];

    for (const creditsUrl of regionUrls) {
      if (scrapeSuccess) break;
      console.log('Spotify credits lookup:', creditsUrl);

      for (const waitFor of waitTimes) {
        try {
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: creditsUrl,
              formats: ['markdown'],
              onlyMainContent: false,
              waitFor,
            }),
          });

          if (!scrapeResponse.ok) {
            const errText = await scrapeResponse.text();
            console.log(`Spotify scrape failed (${creditsUrl}, wait=${waitFor}):`, scrapeResponse.status, errText?.slice?.(0, 200));
            continue;
          }

          const scrapeData = await scrapeResponse.json();
          const content: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
          
          // Check if we got meaningful credits content - specifically look for producer-related keywords
          const hasWriterCredits = /(?:written|songwriter|writer|composer|lyricist)/i.test(content);
          const hasProducerCredits = /(?:produced|producer|production)/i.test(content);
          const hasCredits = hasWriterCredits || hasProducerCredits;
          
          console.log(`Spotify scrape attempt (wait=${waitFor}): ${content.length} chars, hasWriter=${hasWriterCredits}, hasProducer=${hasProducerCredits}`);
          
          if (content.length > 300 && hasCredits) {
            console.log(`Spotify scrape succeeded: ${content.length} chars with credits`);
            markdown = content;
            scrapeSuccess = true;
            break;
          }
        } catch (e) {
          console.log(`Spotify scrape exception (${creditsUrl}):`, e);
        }
      }
    }

    if (!scrapeSuccess) {
      console.log('Spotify credits scrape failed after all attempts');
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Spotify markdown length:', markdown.length, 'chars');
    console.log('Spotify markdown preview:', markdown.slice(0, 800));

    const writers: string[] = [];
    const producers: string[] = [];
    const performedBy: string[] = [];

    // Junk patterns to filter out
    const junkPatterns = [
      /^(play|pause|share|copy|link|more|less|show|hide|view|open|close|skip|next|prev)/i,
      /^(company|communities|useful\s+links|spotify\s+plans|choose\s+a\s+language)/i,
      /^(about|legal|privacy|cookies|accessibility|help|support|contact)/i,
      /^(sign\s+up|log\s+in|premium|free|download|install|get\s+the\s+app)/i,
      /^(follow|unfollow|like|unlike|save|remove|add\s+to)/i,
      /\d+:\d+/, // timestamps
      /^\d+\s*(ms|sec|min|hr|streams?|plays?|followers?|monthly\s+listeners?)/i, // metrics
      /^https?:|^www\.|\.com|\.spotify/i,
      /℗|©|®|™/,
    ];

    const isJunkLine = (s: string): boolean => {
      if (s.length < 2 || s.length > 80) return true;
      for (const p of junkPatterns) {
        if (p.test(s)) return true;
      }
      return false;
    };

    const uniq = (arr: string[]) => {
      const seen = new Set<string>();
      return arr.filter((s) => {
        if (isJunkLine(s)) return false;
        const k = s.toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    const parseNames = (text: string) =>
      text
        .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
        .map((s) => s.replace(/\[.*?\]|\(.*?\)/g, '').replace(/["'""'']/g, '').trim())
        .filter((s) => s.length >= 2 && !isJunkLine(s));

    // Spotify credits pages have sections like:
    // Performed by
    // Artist Name
    //
    // Written by / Songwriters / Writing Credits
    // Name 1
    // Name 2
    //
    // Produced by / Producers / Production
    // Producer Name

    let currentSection: 'writer' | 'producer' | 'performer' | null = null;
    const lines = markdown.split(/\r?\n/);

    // Extended section header patterns for different Spotify layouts
    const writerSectionPatterns = [
      /^(?:written\s+by|songwriters?|writers?|composers?|lyricists?|writing\s+credits?|composition|song\s+credits?)$/i,
      /^(?:written\s+by|songwriters?|writers?|composers?|lyricists?)\s*:/i,
      /^\*\*(?:written\s+by|songwriters?|writers?)\*\*$/i, // Markdown bold headers
    ];
    const producerSectionPatterns = [
      /^(?:produced\s+by|producers?|production|production\s+credits?|produced)$/i,
      /^(?:produced\s+by|producers?|production)\s*:/i,
      /^\*\*(?:produced\s+by|producers?|production)\*\*$/i, // Markdown bold headers
      /^(?:executive\s+producers?|co-?producers?|additional\s+production)$/i,
    ];
    const performerSectionPatterns = [
      /^(?:performed\s+by|artists?|vocals?|featuring|performers?|main\s+artists?|performed)$/i,
      /^(?:performed\s+by|artists?)\s*:/i,
      /^\*\*(?:performed\s+by|artists?)\*\*$/i,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect section headers
      if (writerSectionPatterns.some(p => p.test(line))) {
        currentSection = 'writer';
        // Check if names are on the same line (e.g., "Writers: Name1, Name2")
        const colonMatch = line.match(/:\s*(.+)$/);
        if (colonMatch?.[1]) {
          writers.push(...parseNames(colonMatch[1]));
        }
        continue;
      }
      if (producerSectionPatterns.some(p => p.test(line))) {
        currentSection = 'producer';
        const colonMatch = line.match(/:\s*(.+)$/);
        if (colonMatch?.[1]) {
          producers.push(...parseNames(colonMatch[1]));
        }
        continue;
      }
      if (performerSectionPatterns.some(p => p.test(line))) {
        currentSection = 'performer';
        const colonMatch = line.match(/:\s*(.+)$/);
        if (colonMatch?.[1]) {
          performedBy.push(...parseNames(colonMatch[1]));
        }
        continue;
      }

      // Exit section on new major header or separator
      if (/^(?:label|publisher|record\s+label|℗|©|\d{4}|source|more\s+info|about|share)/i.test(line)) {
        currentSection = null;
        continue;
      }

      // If in a section, treat this line as a name (with additional filtering)
      if (currentSection) {
        // Skip lines that look like UI elements or metadata
        if (!/^(?:play|pause|share|copy|link|more|less|show|hide|view|open|close)/i.test(line)) {
          const names = parseNames(line);
          if (currentSection === 'writer') writers.push(...names);
          else if (currentSection === 'producer') producers.push(...names);
          else if (currentSection === 'performer') performedBy.push(...names);
        }
      }

      // Also look for inline patterns regardless of section (multiple formats)
      const writerInlinePatterns = [
        /(?:Written|Composed|Lyrics?|Songwriting)\s+by\s+(.+)/i,
        /(?:Writer|Songwriter|Composer|Lyricist)s?:\s*(.+)/i,
      ];
      for (const pattern of writerInlinePatterns) {
        const match = line.match(pattern);
        if (match?.[1]) writers.push(...parseNames(match[1]));
      }

      const producerInlinePatterns = [
        /(?:Produced|Production)\s+by\s+(.+)/i,
        /Producers?:\s*(.+)/i,
      ];
      for (const pattern of producerInlinePatterns) {
        const match = line.match(pattern);
        if (match?.[1]) producers.push(...parseNames(match[1]));
      }

      const performerInlinePatterns = [
        /(?:Performed|Featuring|Feat\.?)\s+by\s+(.+)/i,
        /(?:Artists?|Performers?):\s*(.+)/i,
      ];
      for (const pattern of performerInlinePatterns) {
        const match = line.match(pattern);
        if (match?.[1]) performedBy.push(...parseNames(match[1]));
      }
    }

    const data: SpotifyCreditsData = {
      writers: uniq(writers),
      producers: uniq(producers),
      performedBy: uniq(performedBy),
    };

    console.log('Spotify credits extracted:', JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in spotify-credits-lookup:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
