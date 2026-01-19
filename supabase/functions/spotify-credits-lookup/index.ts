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

    const creditsUrl = `https://open.spotify.com/track/${spotifyTrackId}/credits`;
    console.log('Spotify credits lookup:', creditsUrl);

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
        waitFor: 3000,
      }),
    });

    if (!scrapeResponse.ok) {
      const errText = await scrapeResponse.text();
      console.log('Spotify credits scrape failed:', scrapeResponse.status, errText?.slice?.(0, 300));
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
    console.log('Spotify markdown length:', markdown.length, 'chars');
    console.log('Spotify markdown preview:', markdown.slice(0, 600));

    const writers: string[] = [];
    const producers: string[] = [];
    const performedBy: string[] = [];

    const uniq = (arr: string[]) => {
      const seen = new Set<string>();
      return arr.filter((s) => {
        // Filter out URLs, short strings, and navigation text
        if (s.length < 3 || s.length > 100) return false;
        if (/^https?:|^www\.|\.com|\.spotify|^\d+:\d+$|^#|^\(|℗|©/.test(s)) return false;
        if (/^(Company|Communities|Useful links|Spotify Plans|Choose a language)$/i.test(s)) return false;
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    const parseNames = (text: string) =>
      text
        .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
        .map((s) => s.replace(/\[.*?\]|\(.*?\)/g, '').trim())
        .filter((s) => s.length >= 2 && !/^https?:\/\//i.test(s) && !/^\d+$/.test(s));

    // Spotify credits pages have sections like:
    // Performed by
    // Artist Name
    //
    // Written by
    // Name 1
    // Name 2
    //
    // Produced by
    // Producer Name

    let currentSection: 'writer' | 'producer' | 'performer' | null = null;

    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const lower = line.toLowerCase();

      // Detect section headers
      if (/^(?:written\s+by|songwriters?|writers?|composers?|lyricists?)$/i.test(line)) {
        currentSection = 'writer';
        continue;
      }
      if (/^(?:produced\s+by|producers?|production)$/i.test(line)) {
        currentSection = 'producer';
        continue;
      }
      if (/^(?:performed\s+by|artists?|vocals?|featuring)$/i.test(line)) {
        currentSection = 'performer';
        continue;
      }

      // If we hit another section header or separator, reset
      if (/^(?:label|publisher|℗|©|\d{4})$/i.test(line)) {
        currentSection = null;
        continue;
      }

      // If in a section, treat this line as a name
      if (currentSection) {
        const names = parseNames(line);
        if (currentSection === 'writer') writers.push(...names);
        else if (currentSection === 'producer') producers.push(...names);
        else if (currentSection === 'performer') performedBy.push(...names);
      }

      // Also look for inline patterns regardless of section
      const writerInline = line.match(/(?:Written|Composed|Lyrics?)\s+by\s+(.+)/i);
      if (writerInline?.[1]) writers.push(...parseNames(writerInline[1]));

      const producerInline = line.match(/(?:Produced|Production)\s+by\s+(.+)/i);
      if (producerInline?.[1]) producers.push(...parseNames(producerInline[1]));

      const performerInline = line.match(/(?:Performed|Featuring)\s+by\s+(.+)/i);
      if (performerInline?.[1]) performedBy.push(...parseNames(performerInline[1]));
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
