const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type SpotifyCreditsData = {
  writers: string[];
  producers: string[];
  performedBy: string[];
  creditsSource?: 'spotify-internal' | 'spotify-pathfinder' | 'spotify-scrape' | 'genius' | 'deezer' | 'ai';
};

let anonTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Get a Spotify anonymous web-player token.
 * This token is needed for internal endpoints like spclient track-credits.
 */
async function getSpotifyAnonToken(): Promise<string | null> {
  if (anonTokenCache && Date.now() < anonTokenCache.expiresAt) {
    return anonTokenCache.token;
  }

  // Try multiple approaches to get an anonymous token
  const attempts = [
    {
      url: 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'Cookie': 'sp_t=1',
      },
    },
    {
      url: 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'application/json',
        'Origin': 'https://open.spotify.com',
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        headers: attempt.headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.log('Spotify anon token attempt failed:', res.status);
        await res.text();
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        console.log('Spotify anon token non-JSON:', contentType);
        await res.text();
        continue;
      }

      const data = await res.json();
      const token = data?.accessToken;
      if (!token) continue;

      anonTokenCache = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
      console.log('Spotify anon token acquired successfully');
      return token;
    } catch (e) {
      console.log('Spotify anon token attempt exception:', e);
    }
  }

  // Fallback: try using Client Credentials token for Pathfinder
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (clientId && clientSecret) {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          // Note: CC token won't work for spclient but may work for Pathfinder
          anonTokenCache = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000 };
          console.log('Using Client Credentials token as anon fallback');
          return data.access_token;
        }
      }
    } catch (e) {
      console.log('Client credentials fallback for anon token failed:', e);
    }
  }

  return null;
}

/**
 * Strategy 1: Spotify internal track-credits endpoint using anon web player token.
 * This is the same endpoint the Spotify web app uses to show credits.
 */
async function fetchCreditsViaInternalAPI(trackId: string): Promise<SpotifyCreditsData | null> {
  const token = await getSpotifyAnonToken();
  if (!token) {
    console.log('No anon token available for internal credits API');
    return null;
  }

  try {
    const url = `https://spclient.wg.spotify.com/track-credits/v2/trackId/${trackId}`;
    console.log('Trying Spotify internal credits API with anon token...');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.46.25.g9fc9e1be',
      },
    });

    if (!res.ok) {
      console.log(`Spotify internal credits API: ${res.status}`);
      await res.text();
      return null;
    }

    const data = await res.json();
    const writers: string[] = [];
    const producers: string[] = [];
    const performedBy: string[] = [];

    const roleCredits = data.trackCredits?.roleCredits || data.roleCredits || [];
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
      console.log(`Spotify internal credits: ${writers.length} writers, ${producers.length} producers`);
      return { writers, producers, performedBy };
    }

    console.log('Spotify internal credits API returned data but no writer/producer credits');
    return null;
  } catch (e) {
    console.log('Spotify internal credits exception:', e);
    return null;
  }
}

/**
 * Strategy 2: Spotify Pathfinder GraphQL for credits.
 * Uses the trackCredits query to get songwriter and producer info.
 */
async function fetchCreditsViaPathfinder(trackId: string): Promise<SpotifyCreditsData | null> {
  const token = await getSpotifyAnonToken();
  if (!token) return null;

  try {
    console.log('Trying Spotify Pathfinder GraphQL for credits...');
    const res = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.46.25.g9fc9e1be',
      },
      body: JSON.stringify({
        query: `query { trackUnion(uri: "spotify:track:${trackId}") { ... on Track { name firstArtist { items { profile { name } } } credit { roleCredits { roleTitle artists { uri name imageUri } } } } } }`,
      }),
    });

    if (!res.ok) {
      console.log('Spotify Pathfinder credits failed:', res.status);
      await res.text();
      return null;
    }

    const data = await res.json();
    const track = data?.data?.trackUnion;
    const roleCredits = track?.credit?.roleCredits || [];

    const writers: string[] = [];
    const producers: string[] = [];
    const performedBy: string[] = [];

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
      console.log(`Spotify Pathfinder credits: ${writers.length} writers, ${producers.length} producers`);
      return { writers, producers, performedBy };
    }

    console.log('Pathfinder returned track but no credits');
    return null;
  } catch (e) {
    console.log('Spotify Pathfinder credits exception:', e);
    return null;
  }
}

/**
 * Strategy 3: Genius API lookup (uses GENIUS_TOKEN, no Firecrawl needed).
 */
async function fetchCreditsViaGenius(songTitle: string, artist: string): Promise<SpotifyCreditsData | null> {
  const token = Deno.env.get('GENIUS_TOKEN');
  if (!token) return null;

  try {
    const q = `${artist} ${songTitle}`.replace(/[()[\]]/g, '');
    console.log('Genius credits fallback search:', q);
    const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(q)}&per_page=5`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) { await searchRes.text(); return null; }

    const searchData = await searchRes.json();
    const hits = searchData?.response?.hits || [];

    const normalTitle = songTitle.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let songId: number | null = null;
    for (const hit of hits) {
      const result = hit?.result;
      if (!result) continue;
      const rTitle = (result.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (result.primary_artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        songId = result.id;
        break;
      }
    }

    if (!songId) {
      console.log('Genius: no matching song found');
      return null;
    }

    const songRes = await fetch(`https://api.genius.com/songs/${songId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!songRes.ok) { await songRes.text(); return null; }

    const songDataRes = await songRes.json();
    const song = songDataRes?.response?.song;
    if (!song) return null;

    const writers: string[] = [];
    const producers: string[] = [];

    const writerArtists = song.writer_artists || [];
    for (const w of writerArtists) {
      if (w?.name) writers.push(w.name);
    }

    const producerArtists = song.producer_artists || [];
    for (const p of producerArtists) {
      if (p?.name) producers.push(p.name);
    }

    if (writers.length === 0 && producers.length === 0) {
      console.log('Genius: song found but no credits listed');
      return null;
    }

    console.log(`Genius credits: ${writers.length} writers, ${producers.length} producers`);
    return { writers, producers, performedBy: [] };
  } catch (e) {
    console.log('Genius credits fallback exception:', e);
    return null;
  }
}

/**
 * Strategy 4: Deezer API contributor lookup (free, no API key needed).
 */
async function fetchCreditsViaDeezer(songTitle: string, artist: string): Promise<SpotifyCreditsData | null> {
  try {
    const q = `${artist} ${songTitle}`.replace(/[()[\]]/g, '');
    console.log('Deezer credits fallback search:', q);
    const searchRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) { await searchRes.text(); return null; }

    const searchData = await searchRes.json();
    const tracks = searchData?.data || [];

    const normalTitle = songTitle.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let trackId: number | null = null;
    for (const track of tracks) {
      const rTitle = (track.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        trackId = track.id;
        break;
      }
    }

    if (!trackId) {
      console.log('Deezer: no matching track found');
      return null;
    }

    const trackRes = await fetch(`https://api.deezer.com/track/${trackId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!trackRes.ok) { await trackRes.text(); return null; }

    const trackData = await trackRes.json();
    const contributors = trackData?.contributors || [];
    const performedBy: string[] = [];

    for (const c of contributors) {
      if (c?.name) performedBy.push(c.name);
    }

    if (performedBy.length === 0) {
      console.log('Deezer: no contributors found');
      return null;
    }

    console.log(`Deezer contributors: ${performedBy.length} found`);
    return { writers: [], producers: [], performedBy };
  } catch (e) {
    console.log('Deezer credits fallback exception:', e);
    return null;
  }
}

/**
 * Strategy 5: AI knowledge fallback with multi-platform context.
 */
async function fetchCreditsViaAI(
  songTitle: string,
  artist: string,
  geniusHint?: SpotifyCreditsData | null,
  deezerHint?: SpotifyCreditsData | null,
): Promise<SpotifyCreditsData | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;

  const contextParts: string[] = [];
  if (geniusHint) {
    if (geniusHint.writers.length) contextParts.push(`Genius lists writers: ${geniusHint.writers.join(', ')}`);
    if (geniusHint.producers.length) contextParts.push(`Genius lists producers: ${geniusHint.producers.join(', ')}`);
  }
  if (deezerHint?.performedBy?.length) {
    contextParts.push(`Deezer lists contributors: ${deezerHint.performedBy.join(', ')}`);
  }
  const contextBlock = contextParts.length > 0
    ? `\n\nPartial data from other sources:\n${contextParts.join('\n')}`
    : '';

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
            content: `You are a music credits expert with knowledge from Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Genius, AllMusic, Discogs, and ASCAP/BMI/SESAC registries.

Given a song title and artist, recall the known songwriters and producers from ALL platforms and registries in your training data.

Return ONLY a JSON object with these fields:
- writers: string[] (full legal names of songwriters/composers)
- producers: string[] (full names of producers)

RULES:
1. Cross-reference credits from Spotify credits page, Apple Music credits, Genius, Tidal credits, AllMusic, and PRO databases (ASCAP, BMI, SESAC)
2. Use full legal/credit names as they appear on official credits
3. Do NOT fabricate credits - if you are not confident, return empty arrays
4. Do NOT include mixing engineers, mastering engineers, or vocal engineers in producers
5. Include ALL credited songwriters (not just the performing artist)
6. The producer is the person who PRODUCED the track (beat maker, music producer), NOT the performing artist unless they are also credited as producer
7. For Indian/Punjabi music: the music composer (e.g. MixSingh, Desi Crew, Intense) is typically the producer, NOT the singer
8. Return ONLY valid JSON, no markdown`
          },
          {
            role: 'user',
            content: `What are the COMPLETE songwriting and production credits for "${songTitle}" by "${artist}"? Check Spotify, Apple Music, Genius, Tidal, ASCAP, BMI, and any other source you know.${contextBlock}`
          }
        ],
      }),
      signal: AbortSignal.timeout(15000),
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
    let writers = Array.isArray(parsed.writers) ? parsed.writers.filter((w: any) => typeof w === 'string' && w.length > 1) : [];
    let producers = Array.isArray(parsed.producers) ? parsed.producers.filter((p: any) => typeof p === 'string' && p.length > 1) : [];

    // Merge in any Genius data the AI might have missed
    if (geniusHint) {
      for (const gw of geniusHint.writers) {
        if (!writers.some((w: string) => w.toLowerCase() === gw.toLowerCase())) {
          writers.push(gw);
        }
      }
      for (const gp of geniusHint.producers) {
        if (!producers.some((p: string) => p.toLowerCase() === gp.toLowerCase())) {
          producers.push(gp);
        }
      }
    }

    if (writers.length === 0 && producers.length === 0) return null;

    console.log(`AI+multi-source credits: ${writers.length} writers, ${producers.length} producers`);
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

    if (trackId && (typeof trackId !== 'string' || trackId.length > 100)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid trackId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (url && (typeof url !== 'string' || url.length > 2000)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Strategy 1: Spotify internal credits API with anon web player token
    let data: SpotifyCreditsData | null = await fetchCreditsViaInternalAPI(spotifyTrackId);

    // Strategy 2: Spotify Pathfinder GraphQL credits query
    if (!data || (data.writers.length === 0 && data.producers.length === 0)) {
      console.log('Internal credits API had no results, trying Pathfinder GraphQL...');
      const pathfinderData = await fetchCreditsViaPathfinder(spotifyTrackId);
      if (pathfinderData && (pathfinderData.writers.length > 0 || pathfinderData.producers.length > 0)) {
        data = pathfinderData;
      }
    }

    // Strategy 3: Firecrawl scrape fallback
    if (!data || (data.writers.length === 0 && data.producers.length === 0)) {
      console.log('Pathfinder had no credits, trying scrape fallback...');
      const scraped = await fetchCreditsViaScrape(spotifyTrackId);
      if (scraped && (scraped.writers.length > 0 || scraped.producers.length > 0)) {
        data = scraped;
      }
    }

    // Strategy 4 & 5: Genius API + Deezer API (run in parallel, no Firecrawl needed)
    let geniusData: SpotifyCreditsData | null = null;
    let deezerData: SpotifyCreditsData | null = null;
    if ((!data || (data.writers.length === 0 && data.producers.length === 0)) && songTitle && artist) {
      console.log('Scrape failed, trying Genius API + Deezer API in parallel...');
      const [genius, deezer] = await Promise.all([
        fetchCreditsViaGenius(songTitle, artist),
        fetchCreditsViaDeezer(songTitle, artist),
      ]);
      geniusData = genius;
      deezerData = deezer;

      if (geniusData && (geniusData.writers.length > 0 || geniusData.producers.length > 0)) {
        data = geniusData;
        console.log('Using Genius API credits as primary result');
      }
    }

    // Strategy 6: AI knowledge fallback (enhanced with Genius + Deezer context)
    if ((!data || (data.writers.length === 0 && data.producers.length === 0)) && songTitle && artist) {
      console.log('Genius/Deezer insufficient, trying AI knowledge fallback with multi-source context...');
      const aiData = await fetchCreditsViaAI(songTitle, artist, geniusData, deezerData);
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
