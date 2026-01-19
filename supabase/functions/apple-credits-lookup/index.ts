const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AppleCreditsData = {
  writers: string[];
  producers: string[];
  album?: string | null;
  releaseDate?: string | null;
};

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

    const formattedUrl = String(url).trim();
    console.log('Apple credits lookup:', formattedUrl);

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        // Firecrawl format objects vary by version; keep this strictly to supported string formats.
        formats: ['markdown'],
        onlyMainContent: false,
      }),
    });

    if (!scrapeResponse.ok) {
      const errText = await scrapeResponse.text();
      console.log('Apple credits scrape failed:', scrapeResponse.status, errText?.slice?.(0, 200));
      return new Response(
        JSON.stringify({ success: true, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';

    const uniqNames = (items: string[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of items) {
        const s = String(raw || '').trim();
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out;
    };

    const parseNamesFromLine = (line: string) => {
      // Split common separators, keep name-like tokens.
      return line
        .split(/,|·|\||\/|&| and /i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
        .filter((s) => !/^https?:\/\//i.test(s));
    };

    // Heuristic parsing from Apple Music credits page markdown.
    const writers: string[] = [];
    const producers: string[] = [];

    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      // Common labels we see on Apple Music pages
      const writerMatch = line.match(/^(?:Writer\(s\)|Songwriter\(s\)|Written\s+by|Composed\s+by|Composer\(s\)|Lyricist\(s\))\s*[:\-–—]\s*(.+)$/i);
      if (writerMatch?.[1]) {
        writers.push(...parseNamesFromLine(writerMatch[1]));
      }

      const producerMatch = line.match(/^(?:Producer\(s\)|Produced\s+by|Production)\s*[:\-–—]\s*(.+)$/i);
      if (producerMatch?.[1]) {
        producers.push(...parseNamesFromLine(producerMatch[1]));
      }
    }

    const data: AppleCreditsData = {
      writers: uniqNames(writers),
      producers: uniqNames(producers),
      album: null,
      releaseDate: null,
    };

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
