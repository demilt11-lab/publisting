const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type SpotifyCreditsData = {
  writers: string[];
  producers: string[];
  performedBy: string[];
};

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      console.log('Spotify token error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.access_token || null;
  } catch (e) {
    console.log('Spotify token exception:', e);
    return null;
  }
}

/**
 * Try Spotify's internal track-credits endpoint.
 * This is the same endpoint the Spotify app uses to show credits.
 */
async function fetchCreditsViaAPI(trackId: string, token: string): Promise<SpotifyCreditsData | null> {
  // Try the internal credits API
  const urls = [
    `https://spclient.wg.spotify.com/track-credits/v2/trackId/${trackId}`,
    `https://api.spotify.com/v1/tracks/${trackId}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!res.ok) {
        console.log(`Spotify API (${url}): ${res.status}`);
        continue;
      }

      const data = await res.json();
      
      // Handle internal credits endpoint response
      if (data.trackCredits || data.roleCredits) {
        const credits = data.trackCredits || data;
        const writers: string[] = [];
        const producers: string[] = [];
        const performedBy: string[] = [];

        const roleCredits = credits.roleCredits || data.roleCredits || [];
        for (const role of roleCredits) {
          const roleTitle = (role.roleTitle || '').toLowerCase();
          const artists = (role.artists || []).map((a: any) => a.name).filter(Boolean);
          
          if (/writer|songwriter|composer|lyricist|author/.test(roleTitle)) {
            writers.push(...artists);
          } else if (/producer|production/.test(roleTitle)) {
            producers.push(...artists);
          } else if (/performer|artist|vocal|featuring/.test(roleTitle)) {
            performedBy.push(...artists);
          }
        }

        if (writers.length > 0 || producers.length > 0) {
          console.log(`Spotify API credits found: ${writers.length} writers, ${producers.length} producers`);
          return { writers, producers, performedBy };
        }
      }

      // Handle standard tracks endpoint - check for linked_from or external metadata
      if (data.artists && data.name) {
        console.log(`Spotify tracks endpoint: got metadata for "${data.name}" but no credits data`);
      }
    } catch (e) {
      console.log(`Spotify API exception (${url}):`, e);
    }
  }

  return null;
}

/**
 * Fallback: Use Lovable AI to recall known credits for well-known songs.
 */
async function fetchCreditsViaAI(songTitle: string, artist: string): Promise<SpotifyCreditsData | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;

  try {
    console.log('Trying AI knowledge fallback for credits:', songTitle, 'by', artist);
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.0,
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `You are a music credits expert. Given a song title and artist, recall the known songwriters and producers from your training data.

Return ONLY a JSON object with these fields:
- writers: string[] (full legal names of songwriters/composers)
- producers: string[] (full names of producers)

RULES:
1. Only include people you are confident worked on this specific song
2. Use full legal/credit names (e.g. "Aubrey Graham" for Drake as a writer, but "Drake" as a performer)
3. Do NOT fabricate credits - if you don't know, return empty arrays
4. Do NOT include mixing engineers, mastering engineers, or vocalists in producers
5. Return ONLY valid JSON, no markdown`
          },
          {
            role: 'user',
            content: `What are the songwriting and production credits for "${songTitle}" by "${artist}"?`
          }
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.log('AI credits fallback failed:', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const writers = Array.isArray(parsed.writers) ? parsed.writers.filter((w: any) => typeof w === 'string' && w.length > 1) : [];
    const producers = Array.isArray(parsed.producers) ? parsed.producers.filter((p: any) => typeof p === 'string' && p.length > 1) : [];

    if (writers.length === 0 && producers.length === 0) return null;

    console.log(`AI knowledge credits: ${writers.length} writers, ${producers.length} producers`);
    return { writers, producers, performedBy: [] };
  } catch (e) {
    console.log('AI credits fallback exception:', e);
    return null;
  }
}

/**
 * Fallback: Scrape Spotify credits page using Firecrawl.
 */
async function fetchCreditsViaScrape(trackId: string): Promise<SpotifyCreditsData | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return null;

  const urlVariants = [
    `https://open.spotify.com/intl-en/track/${trackId}`,
    `https://open.spotify.com/track/${trackId}/credits`,
  ];

  for (const creditsUrl of urlVariants) {
    try {
      console.log('Spotify scrape fallback:', creditsUrl);
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
          waitFor: 5000,
        }),
      });

      if (!scrapeResponse.ok) continue;

      const scrapeData = await scrapeResponse.json();
      const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
      
      const hasCredits = /(?:written|songwriter|writer|composer|produced|producer)/i.test(markdown);
      if (markdown.length < 300 || !hasCredits) continue;

      console.log(`Spotify scrape got ${markdown.length} chars with credits`);
      return parseMarkdownCredits(markdown);
    } catch (e) {
      console.log(`Spotify scrape exception:`, e);
    }
  }

  return null;
}

function parseMarkdownCredits(markdown: string): SpotifyCreditsData {
  const writers: string[] = [];
  const producers: string[] = [];

  const junkPatterns = [
    /^(play|pause|share|copy|link|more|less|show|hide|view|open|close|skip|next|prev)/i,
    /^(company|communities|useful\s+links|spotify\s+plans|choose\s+a\s+language)/i,
    /^(about|legal|privacy|cookies|accessibility|help|support|contact)/i,
    /^(sign\s+up|log\s+in|premium|free|download|install|get\s+the\s+app)/i,
    /^(follow|unfollow|like|unlike|save|remove|add\s+to)/i,
    /^(from\s+the\s+album|track|album|playlist|popular|related|appears\s+on)/i,
    /\d+:\d+/,
    /^\d+\s*(ms|sec|min|hr|streams?|plays?|followers?|monthly\s+listeners?)/i,
    /^https?:|^www\.|\.com|\.spotify/i,
    /℗|©|®|™/,
    /^[a-zA-Z0-9]{20,}$/,
    /^\(https?:/,
    /^\[.*\]\(https?:/,
    /^[\[\]()\d,]+$/,
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /^\d{1,2},?\s*\d{4}$/,
  ];

  const isJunk = (s: string) => {
    if (s.length < 2 || s.length > 80) return true;
    return junkPatterns.some(p => p.test(s));
  };

  const parseNames = (text: string) =>
    text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .split(/,|·|\||\/|&| and | feat\.? | ft\.? /gi)
      .map(s => s.replace(/\[.*?\]|\(.*?\)/g, '').replace(/["'""'']/g, '').trim())
      .filter(s => s.length >= 2 && s.length <= 60 && !isJunk(s));

  const uniq = (arr: string[]) => {
    const seen = new Set<string>();
    return arr.filter(s => {
      if (isJunk(s)) return false;
      const k = s.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  let section: 'writer' | 'producer' | null = null;
  const lines = markdown.split(/\r?\n/);

  const writerHeaders = [
    /^(?:written\s+by|songwriters?|writers?|composers?|lyricists?|writing\s+credits?)/i,
    /^\*\*(?:written\s+by|songwriters?|writers?)\*\*$/i,
  ];
  const producerHeaders = [
    /^(?:produced\s+by|producers?|production|production\s+credits?)/i,
    /^\*\*(?:produced\s+by|producers?|production)\*\*$/i,
  ];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (writerHeaders.some(p => p.test(t))) {
      section = 'writer';
      const m = t.match(/:\s*(.+)$/);
      if (m?.[1]) writers.push(...parseNames(m[1]));
      continue;
    }
    if (producerHeaders.some(p => p.test(t))) {
      section = 'producer';
      const m = t.match(/:\s*(.+)$/);
      if (m?.[1]) producers.push(...parseNames(m[1]));
      continue;
    }

    if (/^(?:label|publisher|record\s+label|℗|©|\d{4}|source|more\s+info|about|share|popular|appears?\s+on)/i.test(t)) {
      section = null;
      continue;
    }

    if (section === 'writer') writers.push(...parseNames(t));
    else if (section === 'producer') producers.push(...parseNames(t));

    // Inline patterns
    const wm = t.match(/(?:Written|Composed|Lyrics?|Songwriting)\s+by\s+(.+)/i) ||
               t.match(/(?:Writer|Songwriter|Composer)s?:\s*(.+)/i);
    if (wm?.[1]) writers.push(...parseNames(wm[1]));

    const pm = t.match(/(?:Produced|Production)\s+by\s+(.+)/i) ||
               t.match(/Producers?:\s*(.+)/i);
    if (pm?.[1]) producers.push(...parseNames(pm[1]));
  }

  return { writers: uniq(writers), producers: uniq(producers), performedBy: [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trackId, url, songTitle, artist } = await req.json();

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

    // Strategy 1: Spotify Web API with Client Credentials
    const token = await getSpotifyAccessToken();
    let data: SpotifyCreditsData | null = null;

    if (token) {
      data = await fetchCreditsViaAPI(spotifyTrackId, token);
    }

    // Strategy 2: Firecrawl scrape fallback
    if (!data || (data.writers.length === 0 && data.producers.length === 0)) {
      console.log('Spotify API had no credits, trying scrape fallback...');
      const scraped = await fetchCreditsViaScrape(spotifyTrackId);
      if (scraped && (scraped.writers.length > 0 || scraped.producers.length > 0)) {
        data = scraped;
      }
    }

    // Strategy 3: AI knowledge fallback
    if ((!data || (data.writers.length === 0 && data.producers.length === 0)) && songTitle && artist) {
      console.log('Scrape also failed, trying AI knowledge fallback...');
      const aiData = await fetchCreditsViaAI(songTitle, artist);
      if (aiData && (aiData.writers.length > 0 || aiData.producers.length > 0)) {
        data = aiData;
      }
    }

    console.log('Spotify credits result:', JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, data: data || null }),
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
