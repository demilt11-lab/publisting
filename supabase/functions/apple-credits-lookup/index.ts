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
        formats: [
          'markdown',
          {
            type: 'json',
            prompt: [
              'Extract song credits and metadata from this Apple Music page.',
              'Return JSON with keys:',
              '- writers: string[] (songwriters/composers/lyricists)',
              '- producers: string[]',
              '- album: string | null',
              '- releaseDate: string | null (ISO if possible)',
              'Only include person names. Exclude URLs and organizations.',
            ].join('\n'),
          },
        ],
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
    const extractedJson = scrapeData?.data?.json || scrapeData?.json || null;

    const data: AppleCreditsData = {
      writers: Array.isArray(extractedJson?.writers) ? extractedJson.writers : [],
      producers: Array.isArray(extractedJson?.producers) ? extractedJson.producers : [],
      album: typeof extractedJson?.album === 'string' ? extractedJson.album : null,
      releaseDate: typeof extractedJson?.releaseDate === 'string' ? extractedJson.releaseDate : null,
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
