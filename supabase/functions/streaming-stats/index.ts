import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ========== SPOTIFY ==========

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;
let anonTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
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
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
      };
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

async function getSpotifyAnonToken(): Promise<string | null> {
  if (anonTokenCache && Date.now() < anonTokenCache.expiresAt) {
    return anonTokenCache.token;
  }
  try {
    const res = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'Cookie': 'sp_t=1',
      },
    });
    if (!res.ok) {
      console.error('Spotify anon token failed:', res.status);
      return null;
    }
    // Guard against non-JSON responses (e.g. HTML error pages, 403 captcha)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      console.error('Spotify anon token returned non-JSON content-type:', contentType);
      return null;
    }
    let data: any;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error('Spotify anon token JSON parse error:', parseErr);
      return null;
    }
    const token = data.accessToken;
    if (!token) return null;
    anonTokenCache = {
      token,
      expiresAt: Date.now() + 50 * 60 * 1000, // ~50 min
    };
    return token;
  } catch (e) {
    console.error('Spotify anon token exception:', e);
    return null;
  }
}

async function getExactStreamCount(trackId: string): Promise<number | null> {
  try {
    const token = await getSpotifyAnonToken();
    if (!token) return null;

    const variables = { uri: `spotify:track:${trackId}` };
    const extensions = { persistedQuery: { version: 1, sha256Hash: 'ae85b52abb74d20a4c331d4143d4772c95f34757a435d55b8c6e9038067ba7bd' } };
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=getTrack&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

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
      // Fallback: try non-persisted POST query
      return await getExactStreamCountFallback(trackId, token);
    }

    const data = await res.json();
    const playcount = data?.data?.trackUnion?.playcount;
    if (playcount && !isNaN(Number(playcount))) return Number(playcount);

    return null;
  } catch {
    return null;
  }
}

async function getExactStreamCountFallback(trackId: string, token: string): Promise<number | null> {
  try {
    const res = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
      },
      body: JSON.stringify({
        query: `query { trackUnion(uri: "spotify:track:${trackId}") { ... on Track { playcount } } }`,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const playcount = data?.data?.trackUnion?.playcount;
    if (playcount && !isNaN(Number(playcount))) return Number(playcount);
    return null;
  } catch {
    return null;
  }
}

interface SpotifyStats {
  popularity: number | null;
  spotifyUrl: string | null;
  streamCount: number | null;
  isExactStreamCount: boolean;
  estimatedStreams: number | null;
}

function estimateStreamsFromPopularity(popularity: number | null): number | null {
  if (!popularity || popularity <= 0) return null;
  return Math.round(1000 * Math.pow(1.115, popularity));
}

async function getSpotifyStats(title: string, artist: string, trackId?: string): Promise<SpotifyStats> {
  const empty: SpotifyStats = { popularity: null, spotifyUrl: null, streamCount: null, isExactStreamCount: false, estimatedStreams: null };

  // We need a trackId. If provided, use it directly. Otherwise, try to find one via search.
  let resolvedTrackId = trackId || null;
  let popularity: number | null = null;
  let spotifyUrl: string | null = null;

  // Try official Spotify API to get track info (popularity, URL, trackId)
  const token = await getSpotifyAccessToken();
  if (token) {
    try {
      let matchedTrack: any = null;

      if (trackId) {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) matchedTrack = await res.json();
      }

      if (!matchedTrack) {
        const q = `track:${title} artist:${artist}`;
        const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const tracks = data?.tracks?.items || [];

          if (tracks.length > 0) {
            const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

            for (const track of tracks) {
              const rTitle = (track.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
              const rArtist = (track.artists?.[0]?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
              if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
                  (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
                matchedTrack = track;
                break;
              }
            }
            if (!matchedTrack) matchedTrack = tracks[0];
          }
        }
      }

      if (matchedTrack) {
        popularity = matchedTrack.popularity ?? null;
        spotifyUrl = matchedTrack.external_urls?.spotify || null;
        resolvedTrackId = matchedTrack.id || resolvedTrackId;
      }
    } catch (e) {
      console.error('Spotify API search error:', e);
    }
  } else {
    console.log('No Spotify OAuth credentials, skipping official API. Will try pathfinder only.');
  }

  // Try exact count via Pathfinder (independent of OAuth) — retry once on failure
  let exactCount: number | null = null;
  if (resolvedTrackId) {
    exactCount = await getExactStreamCount(resolvedTrackId);
    // Retry once if first attempt failed (anon token may have expired)
    if (exactCount === null) {
      anonTokenCache = null; // invalidate cached token
      exactCount = await getExactStreamCount(resolvedTrackId);
    }
  }

  const estimated = estimateStreamsFromPopularity(popularity);

  return {
    popularity,
    spotifyUrl,
    streamCount: exactCount ?? estimated,
    isExactStreamCount: exactCount !== null,
    estimatedStreams: estimated,
  };
}

// ========== YOUTUBE ==========

interface YouTubeStats {
  viewCount: string | null;
  youtubeUrl: string | null;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function scoreYouTubeCandidate(candidateText: string, channelText: string, title: string, artist: string): number {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedArtist = normalizeSearchText(artist.split(/[,&]|feat\.|ft\./i)[0].trim());
  const normalizedCandidate = normalizeSearchText(candidateText);
  const normalizedChannel = normalizeSearchText(channelText);

  let score = 0;
  if (normalizedCandidate.includes(normalizedTitle) || normalizedTitle.includes(normalizedCandidate)) score += 3;
  if (normalizedCandidate.includes(normalizedArtist) || normalizedChannel.includes(normalizedArtist)) score += 3;

  const lowerCandidate = candidateText.toLowerCase();
  if (lowerCandidate.includes('official')) score += 2;
  if (lowerCandidate.includes('music video') || lowerCandidate.includes('mv')) score += 1;
  if (lowerCandidate.includes('audio')) score += 0.5;
  if (lowerCandidate.includes('cover') || lowerCandidate.includes('karaoke')) score -= 5;
  if (lowerCandidate.includes('live') && !lowerCandidate.includes('official')) score -= 1;

  return score;
}

function extractYouTubeViewCount(html: string): string | null {
  // Try the canonical ytInitialData/playerResponse field first.
  const direct = html.match(/"viewCount":"(\d+)"/);
  if (direct?.[1]) return direct[1];
  // Fallback: simpleText form, e.g. "viewCount":{"simpleText":"1,234,567 views"}
  const simple = html.match(/"viewCount":\{"simpleText":"([\d,\.\s]+)\s*views?"/i);
  if (simple?.[1]) return simple[1].replace(/[^\d]/g, '');
  // Fallback: shortViewCount / videoViewCountRenderer
  const short = html.match(/"videoViewCountRenderer":\{"viewCount":\{"simpleText":"([\d,\.\s]+)\s*views?"/i);
  if (short?.[1]) return short[1].replace(/[^\d]/g, '');
  return null;
}

function extractRendererText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((r: any) => r?.text || '').join('');
  return value?.accessibility?.accessibilityData?.label || '';
}

function parseYouTubeViewText(text: string): string | null {
  const normalized = String(text || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
  const exact = normalized.match(/([\d][\d,.\s]*)\s*views?/i);
  if (exact?.[1]) return exact[1].replace(/[^\d]/g, '');

  const compact = normalized.match(/([\d]+(?:\.\d+)?)\s*([kmb])\s*views?/i);
  if (!compact) return null;
  const n = Number(compact[1]);
  if (!Number.isFinite(n)) return null;
  const multiplier = compact[2] === 'b' ? 1_000_000_000 : compact[2] === 'm' ? 1_000_000 : 1_000;
  return String(Math.round(n * multiplier));
}

function collectYouTubeRenderers(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (node.videoRenderer) out.push(node.videoRenderer);
  if (Array.isArray(node)) {
    for (const item of node) collectYouTubeRenderers(item, out);
  } else {
    for (const value of Object.values(node)) collectYouTubeRenderers(value, out);
  }
  return out;
}

async function getYouTubeStatsViaInternalSearch(title: string, artist: string, queryVariants: string[]): Promise<YouTubeStats> {
  for (const query of queryVariants) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: {
          ...YT_FETCH_HEADERS,
          'Content-Type': 'application/json',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20260501.01.00', hl: 'en', gl: 'US' } },
          query,
          params: 'EgIQAQ%3D%3D',
        }),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const renderers = collectYouTubeRenderers(data).slice(0, 10);
      let best: { videoId: string; viewCount: string; score: number } | null = null;

      for (const video of renderers) {
        const videoId = video?.videoId;
        if (!videoId) continue;
        const videoTitle = extractRendererText(video.title);
        const channel = extractRendererText(video.ownerText || video.longBylineText || video.shortBylineText);
        const viewText = extractRendererText(video.viewCountText || video.shortViewCountText);
        const viewCount = parseYouTubeViewText(viewText);
        if (!viewCount || viewCount === '0') continue;
        const score = scoreYouTubeCandidate(videoTitle, channel, title, artist);
        if (!best || score > best.score) best = { videoId, viewCount, score };
      }

      if (best && best.score >= 3) {
        return { viewCount: best.viewCount, youtubeUrl: `https://www.youtube.com/watch?v=${best.videoId}` };
      }
    } catch (e) {
      console.error('YouTube internal search error for variant:', query, e);
    }
  }

  return { viewCount: null, youtubeUrl: null };
}

const YT_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // CONSENT cookie bypasses the EU/GDPR consent interstitial that otherwise
  // strips ytInitialData (and therefore viewCount) from the HTML response.
  'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI',
};

async function getYouTubeStatsFallback(title: string, artist: string): Promise<YouTubeStats> {
  const normalArtist = artist.split(/[,&]|feat\.|ft\./i)[0].trim();
  const queryVariants = [
    `${normalArtist} - ${title} official music video`,
    `${normalArtist} ${title} official video`,
    `${title} ${normalArtist}`,
  ];

  const internal = await getYouTubeStatsViaInternalSearch(title, artist, queryVariants);
  if (internal.viewCount) return internal;

  for (const query of queryVariants) {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl, { headers: YT_FETCH_HEADERS });
      if (!searchRes.ok) continue;

      const searchHtml = await searchRes.text();
      const videoIds = [...new Set(Array.from(searchHtml.matchAll(/watch\?v=([A-Za-z0-9_-]{11})/g)).map((m) => m[1]))].slice(0, 5);

      let best: { id: string; score: number } | null = null;
      for (const videoId of videoIds) {
        const idx = searchHtml.indexOf(videoId);
        const context = idx >= 0 ? searchHtml.slice(Math.max(0, idx - 220), Math.min(searchHtml.length, idx + 420)) : '';
        const score = scoreYouTubeCandidate(context, context, title, artist);
        if (!best || score > best.score) best = { id: videoId, score };
      }

      if (!best?.id) continue;

      const watchUrl = `https://www.youtube.com/watch?v=${best.id}`;
      const watchRes = await fetch(watchUrl, { headers: YT_FETCH_HEADERS });
      if (!watchRes.ok) {
        return { viewCount: null, youtubeUrl: watchUrl };
      }

      const watchHtml = await watchRes.text();
      const viewCount = extractYouTubeViewCount(watchHtml);
      if (viewCount && viewCount !== '0') {
        return { viewCount, youtubeUrl: watchUrl };
      }

      if (best.score >= 3) {
        console.warn('YouTube fallback: matched video but no viewCount extracted', { videoId: best.id, htmlLen: watchHtml.length });
        return { viewCount: null, youtubeUrl: watchUrl };
      }
    } catch (e) {
      console.error('YouTube fallback error for variant:', query, e);
    }
  }

  return { viewCount: null, youtubeUrl: null };
}

async function getYouTubeStats(title: string, artist: string): Promise<YouTubeStats> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  const normalArtist = artist.split(/[,&]|feat\.|ft\./i)[0].trim();
  const queryVariants = [
    `${normalArtist} - ${title} official music video`,
    `${normalArtist} ${title} official video`,
    `${title} ${normalArtist}`,
  ];

  if (apiKey) {
    for (const q of queryVariants) {
      try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=5&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) {
          console.error('YouTube search failed:', searchRes.status, 'for query:', q);
          continue;
        }

        const searchData = await searchRes.json();
        const items = searchData?.items || [];
        if (items.length === 0) continue;

        let bestVideoId = items[0]?.id?.videoId;
        let bestScore = 0;

        for (const item of items) {
          const snippet = item.snippet || {};
          const score = scoreYouTubeCandidate(snippet.title || '', snippet.channelTitle || '', title, artist);
          if (score > bestScore) {
            bestScore = score;
            bestVideoId = item.id?.videoId;
          }
        }

        if (!bestVideoId) continue;

        const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${bestVideoId}&key=${apiKey}`;
        const statsRes = await fetch(statsUrl);
        if (!statsRes.ok) {
          return await getYouTubeStatsFallback(title, artist);
        }

        const statsData = await statsRes.json();
        const viewCount = statsData?.items?.[0]?.statistics?.viewCount;
        if (viewCount && viewCount !== '0') {
          return {
            viewCount,
            youtubeUrl: `https://www.youtube.com/watch?v=${bestVideoId}`,
          };
        }

        if (bestScore >= 3) {
          return {
            viewCount: viewCount || null,
            youtubeUrl: `https://www.youtube.com/watch?v=${bestVideoId}`,
          };
        }
      } catch (e) {
        console.error('YouTube stats error for variant:', q, e);
      }
    }
  }

  return await getYouTubeStatsFallback(title, artist);
}

// ========== GENIUS ==========

interface GeniusStats {
  pageviews: number | null;
  geniusUrl: string | null;
}

async function getGeniusStats(title: string, artist: string): Promise<GeniusStats> {
  const token = Deno.env.get('GENIUS_TOKEN');
  if (!token) return { pageviews: null, geniusUrl: null };

  try {
    const q = `${artist} ${title}`;
    const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!searchRes.ok) return { pageviews: null, geniusUrl: null };

    const searchData = await searchRes.json();
    const hits = searchData?.response?.hits || [];
    if (hits.length === 0) return { pageviews: null, geniusUrl: null };

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let bestHit = hits[0];
    for (const hit of hits) {
      const rTitle = (hit.result?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (hit.result?.primary_artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        bestHit = hit;
        break;
      }
    }

    const songId = bestHit.result?.id;
    if (!songId) return { pageviews: null, geniusUrl: bestHit.result?.url || null };

    const songRes = await fetch(`https://api.genius.com/songs/${songId}?text_format=plain`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!songRes.ok) return { pageviews: null, geniusUrl: bestHit.result?.url || null };

    const songData = await songRes.json();
    const song = songData?.response?.song;

    return {
      pageviews: song?.stats?.pageviews || null,
      geniusUrl: song?.url || bestHit.result?.url || null,
    };
  } catch (e) {
    console.error('Genius stats error:', e);
    return { pageviews: null, geniusUrl: null };
  }
}

// ========== SHAZAM ==========

interface ShazamStats {
  shazamCount: number | null;
  shazamUrl: string | null;
}

async function getShazamStats(title: string, artist: string): Promise<ShazamStats> {
  try {
    const q = `${artist} ${title}`;
    const searchUrl = `https://www.shazam.com/services/amapi/v1/catalog/US/search?term=${encodeURIComponent(q)}&types=songs&limit=5`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!searchRes.ok) {
      console.error('Shazam search failed:', searchRes.status);
      return await getShazamStatsAlt(title, artist);
    }

    const searchData = await searchRes.json();
    const songs = searchData?.results?.songs?.data || [];
    if (songs.length === 0) return await getShazamStatsAlt(title, artist);

    return await getShazamStatsAlt(title, artist);
  } catch (e) {
    console.error('Shazam stats error:', e);
    return { shazamCount: null, shazamUrl: null };
  }
}

async function getShazamStatsAlt(title: string, artist: string): Promise<ShazamStats> {
  try {
    const q = `${artist} ${title}`;
    const searchUrl = `https://www.shazam.com/services/search/v3/en/US/web/search?query=${encodeURIComponent(q)}&numResults=5&offset=0&types=songs`;
    
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error('Shazam alt search failed:', res.status);
      return { shazamCount: null, shazamUrl: null };
    }

    const data = await res.json();
    const tracks = data?.tracks?.hits || [];
    if (tracks.length === 0) return { shazamCount: null, shazamUrl: null };

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    let bestTrack = tracks[0];
    for (const track of tracks) {
      const rTitle = (track.heading?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.heading?.subtitle || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        bestTrack = track;
        break;
      }
    }

    const trackKey = bestTrack?.key;
    if (!trackKey) return { shazamCount: null, shazamUrl: bestTrack?.url || null };

    const countUrl = `https://www.shazam.com/discovery/v5/en/US/web/-/track/${trackKey}`;
    const countRes = await fetch(countUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!countRes.ok) {
      return { shazamCount: null, shazamUrl: `https://www.shazam.com/track/${trackKey}` };
    }

    const countData = await countRes.json();
    const shazamCount = countData?.shazamCount || countData?.shazam_count || null;

    return {
      shazamCount: shazamCount ? parseInt(String(shazamCount), 10) : null,
      shazamUrl: `https://www.shazam.com/track/${trackKey}`,
    };
  } catch (e) {
    console.error('Shazam alt stats error:', e);
    return { shazamCount: null, shazamUrl: null };
  }
}

// ========== HANDLER ==========

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, artist, spotifyTrackId, clearCache } = await req.json();

    if (!title || !artist) {
      return new Response(
        JSON.stringify({ success: false, error: 'Title and artist are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
    const supabase = getSupabaseClient();

    // Clear cache if requested
    if (clearCache) {
      console.log('Clearing cache for:', cacheKey);
      await supabase.from('streaming_stats_cache').delete().eq('cache_key', cacheKey);
    }

    // Check cache first (skip if clearCache)
    if (!clearCache) {
      const { data: cached } = await supabase
        .from('streaming_stats_cache')
        .select('data, expires_at')
        .eq('cache_key', cacheKey)
        .single();

      const cachedSpotify = Number(cached?.data?.spotify?.streamCount ?? cached?.data?.spotify?.estimatedStreams ?? 0);
      const cachedYouTube = Number(cached?.data?.youtube?.viewCount ?? 0);
      const hasFreshYouTubeCheck = cached?.data?.youtube?.lookupVersion === 2;
      const hasUsableCachedMetrics = (cachedSpotify > 0 || cachedYouTube > 0) && hasFreshYouTubeCheck;

      if (cached && new Date(cached.expires_at) > new Date() && hasUsableCachedMetrics) {
        console.log('Cache hit for:', cacheKey);
        return new Response(
          JSON.stringify({ success: true, data: cached.data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (cached && !hasUsableCachedMetrics) {
        console.log('Cache stale/empty, refreshing:', cacheKey);
      }
    }

    console.log('Cache miss for:', title, 'by', artist);

    // Fetch all in parallel with 12s timeout per source
    const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 12000): Promise<T> =>
      Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

    const [spotify, youtube, genius, shazam] = await Promise.all([
      withTimeout(getSpotifyStats(title, artist, spotifyTrackId), { popularity: null, spotifyUrl: null, streamCount: null, isExactStreamCount: false, estimatedStreams: null }),
      withTimeout(getYouTubeStats(title, artist), { viewCount: null, youtubeUrl: null }),
      withTimeout(getGeniusStats(title, artist), { pageviews: null, geniusUrl: null }),
      withTimeout(getShazamStats(title, artist), { shazamCount: null, shazamUrl: null }),
    ]);

    const statsData = {
      spotify: {
        popularity: spotify.popularity,
        streamCount: spotify.streamCount,
        isExactStreamCount: spotify.isExactStreamCount,
        estimatedStreams: spotify.estimatedStreams,
        url: spotify.spotifyUrl,
      },
      youtube: {
        viewCount: youtube.viewCount,
        url: youtube.youtubeUrl,
        lookupVersion: 2,
      },
      genius: {
        pageviews: genius.pageviews,
        url: genius.geniusUrl,
      },
      shazam: {
        count: shazam.shazamCount,
        url: shazam.shazamUrl,
      },
    };

    // Store in cache (upsert)
    try {
      await supabase
        .from('streaming_stats_cache')
        .upsert({
          cache_key: cacheKey,
          data: statsData,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'cache_key' });
    } catch (cacheErr) {
      console.error('Cache upsert error:', cacheErr);
    }

    console.log('Cached streaming stats for:', cacheKey);

    return new Response(JSON.stringify({ success: true, data: statsData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Streaming stats error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch streaming stats' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
