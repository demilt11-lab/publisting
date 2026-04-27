const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type SpotifyCreditsData = {
  writers: string[];
  producers: string[];
  performedBy: string[];
  creditsSource?: 'spotify-internal' | 'spotify-pathfinder' | 'spotify-scrape' | 'spotify-webapi' | 'genius' | 'deezer' | 'ai';
};

let tokenCache: { token: string; expiresAt: number; type: 'cc' | 'anon' } | null = null;

/**
 * Get a Spotify Client Credentials token (proper Web API auth).
 * This is more reliable than anon tokens and works for basic endpoints.
 */
async function getClientCredentialsToken(): Promise<string | null> {
  if (tokenCache && tokenCache.type === 'cc' && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

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
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        tokenCache = {
          token: data.access_token,
          expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
          type: 'cc',
        };
        console.log('Spotify Client Credentials token acquired');
        return data.access_token;
      }
    }
    await res.text();
  } catch (e) {
    console.log('Client credentials token failed:', e);
  }
  return null;
}

/**
 * Get a Spotify anonymous web-player token for internal endpoints.
 */
async function getSpotifyAnonToken(): Promise<string | null> {
  if (tokenCache && tokenCache.type === 'anon' && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const attempts = [
    {
      url: 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
        await res.text();
        continue;
      }

      const data = await res.json();
      const token = data?.accessToken;
      if (!token) continue;

      tokenCache = { token, expiresAt: Date.now() + 50 * 60 * 1000, type: 'anon' };
      console.log('Spotify anon token acquired');
      return token;
    } catch (e) {
      console.log('Spotify anon token attempt exception:', e);
    }
  }

  return null;
}

/**
 * Strategy 0: Spotify Web API track endpoint for basic metadata + artist IDs.
 * Uses Client Credentials (reliable, no 403s).
 */
async function fetchTrackMetadataViaWebAPI(trackId: string): Promise<{
  artistIds: Array<{ name: string; id: string }>;
  albumArtistIds: Array<{ name: string; id: string }>;
} | null> {
  const token = await getClientCredentialsToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.log('Spotify Web API track fetch failed:', res.status);
      await res.text();
      return null;
    }

    const data = await res.json();
    const artistIds = (data.artists || []).map((a: any) => ({ name: a.name, id: a.id }));
    const albumArtists = (data.album?.artists || []).map((a: any) => ({ name: a.name, id: a.id }));

    return { artistIds, albumArtistIds: albumArtists };
  } catch (e) {
    console.log('Spotify Web API track exception:', e);
    return null;
  }
}

/**
 * Strategy 1: Spotify internal track-credits endpoint.
 * Try anon token first, then CC token as fallback.
 */
async function fetchCreditsViaInternalAPI(trackId: string): Promise<SpotifyCreditsData | null> {
  // Try anon token first (better for internal endpoints)
  let token = await getSpotifyAnonToken();
  if (!token) {
    // Fallback to CC token
    token = await getClientCredentialsToken();
  }
  if (!token) return null;

  try {
    const url = `https://spclient.wg.spotify.com/track-credits/v2/trackId/${trackId}`;
    console.log('Trying Spotify internal credits API...');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.52.442.g4da110e4',
      },
    });

    if (!res.ok) {
      console.log(`Spotify internal credits API: ${res.status}`);
      await res.text();

      // If anon token got 403, invalidate and try CC
      if (res.status === 403 && tokenCache?.type === 'anon') {
        tokenCache = null;
        const ccToken = await getClientCredentialsToken();
        if (ccToken) {
          const retryRes = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${ccToken}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'app-platform': 'WebPlayer',
            },
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            return parseRoleCredits(retryData, 'spotify-internal');
          }
          await retryRes.text();
        }
      }
      return null;
    }

    const data = await res.json();
    return parseRoleCredits(data, 'spotify-internal');
  } catch (e) {
    console.log('Spotify internal credits exception:', e);
    return null;
  }
}

function parseRoleCredits(data: any, source: 'spotify-internal' | 'spotify-pathfinder'): SpotifyCreditsData | null {
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
    console.log(`${source} credits: ${writers.length} writers, ${producers.length} producers`);
    return { writers, producers, performedBy, creditsSource: source };
  }
  return null;
}

/**
 * Strategy 2: Spotify Pathfinder GraphQL for credits.
 */
async function fetchCreditsViaPathfinder(trackId: string): Promise<SpotifyCreditsData | null> {
  // Try anon first, then CC
  let token = await getSpotifyAnonToken();
  if (!token) token = await getClientCredentialsToken();
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
        'spotify-app-version': '1.2.52.442.g4da110e4',
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
      return { writers, producers, performedBy, creditsSource: 'spotify-pathfinder' as const };
    }

    console.log('Pathfinder returned track but no credits');
    return null;
  } catch (e) {
    console.log('Spotify Pathfinder credits exception:', e);
    return null;
  }
}

/**
 * Strategy 3: Genius API lookup.
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

    if (!songId) return null;

    const songRes = await fetch(`https://api.genius.com/songs/${songId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!songRes.ok) { await songRes.text(); return null; }

    const songDataRes = await songRes.json();
    const song = songDataRes?.response?.song;
    if (!song) return null;

    const writers = (song.writer_artists || []).map((w: any) => w?.name).filter(Boolean);
    const producers = (song.producer_artists || []).map((p: any) => p?.name).filter(Boolean);

    if (writers.length === 0 && producers.length === 0) return null;

    console.log(`Genius credits: ${writers.length} writers, ${producers.length} producers`);
    return { writers, producers, performedBy: [], creditsSource: 'genius' as const };
  } catch (e) {
    console.log('Genius credits fallback exception:', e);
    return null;
  }
}

/**
 * Strategy 4: Deezer API contributor lookup.
 */
async function fetchCreditsViaDeezer(songTitle: string, artist: string): Promise<SpotifyCreditsData | null> {
  try {
    const q = `${artist} ${songTitle}`.replace(/[()[\]]/g, '');
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

    if (!trackId) return null;

    const trackRes = await fetch(`https://api.deezer.com/track/${trackId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!trackRes.ok) { await trackRes.text(); return null; }

    const trackData = await trackRes.json();
    const contributors = trackData?.contributors || [];
    const performedBy = contributors.map((c: any) => c?.name).filter(Boolean);

    if (performedBy.length === 0) return null;

    console.log(`Deezer contributors: ${performedBy.length} found`);
    return { writers: [], producers: [], performedBy, creditsSource: 'deezer' as const };
  } catch (e) {
    console.log('Deezer credits fallback exception:', e);
    return null;
  }
}

/**
 * Strategy 5: AI knowledge fallback.
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
3. CRITICAL: Do NOT guess. If you cannot recall this exact song with confidence from at least TWO independent sources, return empty arrays. It is far better to return nothing than to invent a name.
4. Do NOT include mixing engineers, mastering engineers, or vocal engineers in producers
5. Include ALL credited songwriters (not just the performing artist)
6. The producer is the person who PRODUCED the track (beat maker, music producer), NOT the performing artist unless they are also credited as producer
7. For Indian/Punjabi music: the music composer (e.g MixSingh, Desi Crew, Intense) is typically the producer, NOT the singer
8. Never invent stylized stage names you have not seen in real release credits
9. Return ONLY valid JSON, no markdown`
          },
          {
            role: 'user',
            content: `What are the COMPLETE songwriting and production credits for "${songTitle}" by "${artist}"? Check Spotify, Apple Music, Genius, Tidal, ASCAP, BMI, and any other source you know.${contextBlock}`
          }
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    let writers = Array.isArray(parsed.writers) ? parsed.writers.filter((w: any) => typeof w === 'string' && w.length > 1) : [];
    let producers = Array.isArray(parsed.producers) ? parsed.producers.filter((p: any) => typeof p === 'string' && p.length > 1) : [];

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
    return { writers, producers, performedBy: [], creditsSource: 'ai' as const };
  } catch (e) {
    console.log('AI credits fallback exception:', e);
    return null;
  }
}

/**
 * Firecrawl scrape fallback.
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

    const wm = t.match(/(?:Written|Composed|Lyrics?|Songwriting)\s+by\s+(.+)/i) ||
               t.match(/(?:Writer|Songwriter|Composer)s?:\s*(.+)/i);
    if (wm?.[1]) writers.push(...parseNames(wm[1]));

    const pm = t.match(/(?:Produced|Production)\s+by\s+(.+)/i) ||
               t.match(/Producers?:\s*(.+)/i);
    if (pm?.[1]) producers.push(...parseNames(pm[1]));
  }

  return { writers: uniq(writers), producers: uniq(producers), performedBy: [], creditsSource: 'spotify-scrape' as const };
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

    // Strategy 0: Get track metadata via Web API (reliable, for artist IDs)
    const trackMeta = await fetchTrackMetadataViaWebAPI(spotifyTrackId);
    const artistIds = trackMeta?.artistIds || [];

    // Strategy 1: Spotify internal credits API (try anon, fallback to CC)
    let data: SpotifyCreditsData | null = await fetchCreditsViaInternalAPI(spotifyTrackId);

    // Strategy 2: Spotify Pathfinder GraphQL
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

    // Strategy 4 & 5: Genius + Deezer in parallel
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
      }
    }

    // Strategy 6: AI knowledge fallback
    if ((!data || (data.writers.length === 0 && data.producers.length === 0)) && songTitle && artist) {
      console.log('Genius/Deezer insufficient, trying AI knowledge fallback...');
      const aiData = await fetchCreditsViaAI(songTitle, artist, geniusData, deezerData);
      if (aiData && (aiData.writers.length > 0 || aiData.producers.length > 0)) {
        data = aiData;
      }
    }

    console.log('Spotify credits result:', JSON.stringify(data));

    return new Response(
      JSON.stringify({
        success: true,
        data: data || null,
        artistIds: artistIds.length > 0 ? artistIds : undefined,
      }),
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
