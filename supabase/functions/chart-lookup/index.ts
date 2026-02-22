import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChartPlacement {
  chart: string;
  peakPosition?: number;
  currentPosition?: number;
  weeksOnChart?: number;
  date?: string;
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songTitle, artist } = await req.json();

    if (!songTitle) {
      return new Response(
        JSON.stringify({ success: false, error: 'Song title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const cacheKey = `${songTitle.toLowerCase().trim()}::${(artist || '').toLowerCase().trim()}`;

    const { data: cached } = await supabase
      .from('chart_placements_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      console.log('Chart cache hit for:', cacheKey);
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

    console.log('Chart lookup for:', songTitle, 'by', artist);

    const placements: ChartPlacement[] = [];

    // Search for chart placements across Billboard, Spotify Charts, Apple Music, Shazam
    const searchPromise = fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${songTitle}" "${artist}" (Billboard Hot 100 OR "Spotify chart" OR "Apple Music chart" OR "Shazam chart") peak position number`,
        limit: 8,
        scrapeOptions: { formats: ['markdown'] },
      }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const searchResult = await searchPromise;

    if (searchResult?.data) {
      const fullContent = searchResult.data
        .map((r: any) => r.markdown || r.description || '')
        .join('\n\n');

      console.log('Chart content length:', fullContent.length);

      const titleLower = songTitle.toLowerCase();
      const artistLower = (artist || '').toLowerCase();

      // Check if content is relevant
      const isRelevant = fullContent.toLowerCase().includes(titleLower) ||
                          fullContent.toLowerCase().includes(artistLower);

      if (isRelevant) {
        // Billboard Hot 100
        const billboardPatterns = [
          /Billboard\s+Hot\s+100[^]*?(?:#|No\.\s*|number\s*|peaked\s+at\s*|position\s*)(\d{1,3})/gi,
          /(?:#|No\.\s*|peaked\s+at\s*|number\s*)(\d{1,3})\s+(?:on\s+(?:the\s+)?)?Billboard\s+Hot\s+100/gi,
          /Hot\s+100[^]*?(?:peak|peaked|reached|hit|debuted)\s+(?:at\s+)?(?:#|No\.\s*|number\s*)(\d{1,3})/gi,
        ];

        for (const pattern of billboardPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(fullContent);
          if (match) {
            const pos = parseInt(match[1]);
            if (pos > 0 && pos <= 100) {
              if (!placements.some(p => p.chart === 'Billboard Hot 100')) {
                placements.push({
                  chart: 'Billboard Hot 100',
                  peakPosition: pos,
                  source: 'Billboard',
                });
              }
            }
          }
        }

        // Weeks on chart
        const weeksMatch = fullContent.match(/(\d+)\s+weeks?\s+on\s+(?:the\s+)?(?:Billboard\s+)?(?:Hot\s+100|chart)/i);
        if (weeksMatch) {
          const existing = placements.find(p => p.chart === 'Billboard Hot 100');
          if (existing) existing.weeksOnChart = parseInt(weeksMatch[1]);
        }

        // Spotify Charts
        const spotifyPatterns = [
          /Spotify[^]*?(?:chart|top\s+\d+|viral)[^]*?(?:#|No\.\s*|number\s*|position\s*)(\d{1,3})/gi,
          /(?:#|No\.\s*)(\d{1,3})\s+(?:on\s+)?Spotify/gi,
        ];

        for (const pattern of spotifyPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(fullContent);
          if (match) {
            const pos = parseInt(match[1]);
            if (pos > 0 && pos <= 200) {
              if (!placements.some(p => p.chart === 'Spotify Charts')) {
                placements.push({
                  chart: 'Spotify Charts',
                  peakPosition: pos,
                  source: 'Spotify',
                });
              }
            }
          }
        }

        // Apple Music Charts
        const applePatterns = [
          /Apple\s+Music[^]*?(?:chart|top\s+\d+)[^]*?(?:#|No\.\s*|number\s*|position\s*)(\d{1,3})/gi,
          /(?:#|No\.\s*)(\d{1,3})\s+(?:on\s+)?Apple\s+Music/gi,
        ];

        for (const pattern of applePatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(fullContent);
          if (match) {
            const pos = parseInt(match[1]);
            if (pos > 0 && pos <= 200) {
              if (!placements.some(p => p.chart === 'Apple Music')) {
                placements.push({
                  chart: 'Apple Music',
                  peakPosition: pos,
                  source: 'Apple Music',
                });
              }
            }
          }
        }

        // Shazam Charts
        const shazamPatterns = [
          /Shazam[^]*?(?:chart|top\s+\d+)[^]*?(?:#|No\.\s*|number\s*|position\s*)(\d{1,3})/gi,
          /(?:#|No\.\s*)(\d{1,3})\s+(?:on\s+)?Shazam/gi,
        ];

        for (const pattern of shazamPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(fullContent);
          if (match) {
            const pos = parseInt(match[1]);
            if (pos > 0 && pos <= 200) {
              if (!placements.some(p => p.chart === 'Shazam')) {
                placements.push({
                  chart: 'Shazam',
                  peakPosition: pos,
                  source: 'Shazam',
                });
              }
            }
          }
        }
      }
    }

    console.log('Found chart placements:', placements);

    const responseData = {
      success: true,
      data: { songTitle, artist, placements },
    };

    // Cache result
    await supabase
      .from('chart_placements_cache')
      .upsert({
        cache_key: cacheKey,
        data: responseData,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' })
      .catch((e: Error) => console.error('Chart cache write failed:', e));

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Chart lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup charts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
