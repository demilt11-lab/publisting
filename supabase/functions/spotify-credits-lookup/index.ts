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

    // Try just one URL with a single attempt to avoid timeout
    const creditsUrl = `https://open.spotify.com/track/${spotifyTrackId}/credits`;
    let markdown = '';
    let scrapeSuccess = false;
    const waitFor = 5000;

    console.log('Spotify credits lookup:', creditsUrl);

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

      if (scrapeResponse.ok) {
        const scrapeData = await scrapeResponse.json();
        const content: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        
        // Check if we got meaningful credits content
        const hasWriterCredits = /(?:written|songwriter|writer|composer|lyricist)/i.test(content);
        const hasProducerCredits = /(?:produced|producer|production)/i.test(content);
        const hasCredits = hasWriterCredits || hasProducerCredits;
        
        console.log(`Spotify scrape attempt (wait=${waitFor}): ${content.length} chars, hasWriter=${hasWriterCredits}, hasProducer=${hasProducerCredits}`);
        
        if (content.length > 300 && hasCredits) {
          console.log(`Spotify scrape succeeded: ${content.length} chars with credits`);
          markdown = content;
          scrapeSuccess = true;
        }
      } else {
        const errText = await scrapeResponse.text();
        console.log(`Spotify scrape failed (${creditsUrl}, wait=${waitFor}):`, scrapeResponse.status, errText?.slice?.(0, 200));
      }
    } catch (e) {
      console.log(`Spotify scrape exception:`, e);
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
      /^(from\s+the\s+album|track|album|playlist|popular|related|appears\s+on)/i,
      /\d+:\d+/, // timestamps
      /^\d+\s*(ms|sec|min|hr|streams?|plays?|followers?|monthly\s+listeners?)/i, // metrics
      /^https?:|^www\.|\.com|\.spotify/i,
      /℗|©|®|™/,
      /^[a-zA-Z0-9]{20,}$/, // Spotify IDs (long alphanumeric strings)
      /^\(https?:/, // markdown link fragments like "(https:..."
      /^\[.*\]\(https?:/, // full markdown links
      /^[\[\]()\d,]+$/, // pure punctuation/numbers
      /^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i, // dates
      /^\d{1,2},?\s*\d{4}$/, // date fragments like "2, 2004"
      /^(pleasure|pain)$/i, // common junk words from track titles bleeding in
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
        // Strip markdown links: [Name](url) → Name
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Strip bare URLs
        .replace(/https?:\/\/\S+/g, '')
        .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
        .map((s) => s.replace(/\[.*?\]|\(.*?\)/g, '').replace(/["'""'']/g, '').trim())
        .filter((s) => s.length >= 2 && s.length <= 60 && !isJunkLine(s) && !/^[a-zA-Z0-9]{15,}$/.test(s));

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

      // Exit section on new major header, separator, or non-credits page content
      if (/^(?:label|publisher|record\s+label|℗|©|\d{4}|source|more\s+info|about|share|popular|appears?\s+on|fans\s+also\s+like|related\s+artists?|discography|singles?|albums?|playlists?|concerts?|merch|tour|all\s+I\s+want|you\s+might\s+also\s+like|recommended|similar)/i.test(line)) {
        currentSection = null;
        continue;
      }

      // Skip lines that look like track listings (e.g., "Song Title Artist Name")
      // These tend to be 3+ words with no separator and appear after credits
      const looksLikeTrackListing = currentSection === 'performer' && 
        lines.slice(Math.max(0, i - 3), i).filter(l => l.trim()).length > 2 &&
        !writerSectionPatterns.some(p => p.test(line)) &&
        !producerSectionPatterns.some(p => p.test(line)) &&
        !performerSectionPatterns.some(p => p.test(line));

      // If in a section, treat this line as a name (with additional filtering)
      if (currentSection && !looksLikeTrackListing) {
        // Skip lines that look like UI elements or metadata
        if (!/^(?:play|pause|share|copy|link|more|less|show|hide|view|open|close)/i.test(line)) {
          const names = parseNames(line);
          if (currentSection === 'writer') writers.push(...names);
          else if (currentSection === 'producer') producers.push(...names);
          else if (currentSection === 'performer') {
            // Limit performers to avoid picking up related artists/track listings
            if (performedBy.length < 5) {
              performedBy.push(...names);
            } else {
              // Too many performers = we've drifted into non-credits content
              currentSection = null;
            }
          }
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

    // performedBy from Spotify scraping is unreliable (picks up related artists,
    // track listings, etc. from the full page). We get performers from MusicBrainz
    // instead, so we clear it here to avoid polluting results.
    const data: SpotifyCreditsData = {
      writers: uniq(writers),
      producers: uniq(producers),
      performedBy: [],
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
