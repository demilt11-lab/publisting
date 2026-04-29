const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Fetch from Odesli (song.link) with exponential backoff on 429 rate limits.
 * Retries up to 3 times with delays of 1s, 2s, 4s.
 */
async function fetchOdesliWithRetry(odesliUrl: string, maxRetries = 3): Promise<Response> {
  let lastResp: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(odesliUrl);
    if (resp.status !== 429) return resp;

    lastResp = resp;
    await resp.text(); // consume body

    if (attempt < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`Odesli rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.log('Odesli rate limit persisted after retries');
  return lastResp!;
}

interface ParsedUrl {
  platform: 'spotify' | 'apple' | 'tidal' | 'deezer' | 'youtube' | 'amazon' | 'search';
  id?: string;
  url?: string;
  query?: string;
}

interface ExtractedSongInfo {
  title: string;
  artist: string;
  platform: string;
  isrc?: string;
  spotifyTrackId?: string;
}

// ========== SPOTIFY CLIENT CREDENTIALS ==========

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;
let spotifyAnonTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  // Return cached token if still valid
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
    if (!res.ok) {
      console.log('Spotify token error:', res.status);
      await res.text();
      return null;
    }
    const data = await res.json();
    if (data.access_token) {
      // Cache with 5 min buffer before expiry
      spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
      };
      return data.access_token;
    }
    return null;
  } catch (e) {
    console.log('Spotify token exception:', e);
    return null;
  }
}

async function getSpotifyAnonToken(): Promise<string | null> {
  if (spotifyAnonTokenCache && Date.now() < spotifyAnonTokenCache.expiresAt) {
    return spotifyAnonTokenCache.token;
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
      console.log('Spotify anon token failed:', res.status);
      await res.text();
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      console.log('Spotify anon token returned non-JSON content-type:', contentType);
      await res.text();
      return null;
    }

    const data = await res.json();
    const token = data?.accessToken;
    if (!token) return null;

    spotifyAnonTokenCache = {
      token,
      expiresAt: Date.now() + 50 * 60 * 1000,
    };

    return token;
  } catch (e) {
    console.log('Spotify anon token exception:', e);
    return null;
  }
}

async function getSpotifyTrackViaPathfinder(trackId: string): Promise<{
  title: string;
  artist: string;
  albumName?: string | null;
  albumLabel?: string | null;
} | null> {
  const token = await getSpotifyAnonToken();
  if (!token) return null;

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
        'spotify-app-version': '1.2.46.25.g9fc9e1be',
      },
      body: JSON.stringify({
        query: `query { trackUnion(uri: "spotify:track:${trackId}") { ... on Track { name firstArtist { items { profile { name } } } artists { items { profile { name } name } } albumOfTrack { name label copyright { items { text type } } } } } }`,
      }),
    });

    if (!res.ok) {
      console.log('Spotify Pathfinder track fetch failed:', res.status);
      await res.text();
      return null;
    }

    const data = await res.json();
    const track = data?.data?.trackUnion;
    const title = String(track?.name || '').trim();
    const artist = String(
      track?.firstArtist?.items?.[0]?.profile?.name ||
      track?.artists?.items?.[0]?.profile?.name ||
      track?.artists?.items?.[0]?.name ||
      ''
    ).trim();
    const albumName = typeof track?.albumOfTrack?.name === 'string' ? track.albumOfTrack.name.trim() : null;
    const albumLabel = typeof track?.albumOfTrack?.label === 'string' ? track.albumOfTrack.label.trim() : null;

    if (!title || !artist) {
      console.log('Spotify Pathfinder missing exact title/artist for track:', trackId);
      return null;
    }

    console.log('Spotify Pathfinder resolved:', title, 'by', artist, 'label:', albumLabel);
    return { title, artist, albumName, albumLabel };
  } catch (e) {
    console.log('Spotify Pathfinder track fetch exception:', e);
    return null;
  }
}

/**
 * Search Spotify API for a track and return metadata including ISRC and track ID.
 */
async function searchSpotifyTrack(title: string, artist: string): Promise<{
  isrc: string | null;
  trackId: string | null;
  title: string;
  artist: string;
  artistIds?: Record<string, string>;
} | null> {
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  try {
    const q = `track:${title} artist:${artist}`;
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`;
    console.log('Spotify API search:', q);

    const res = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      console.log('Spotify search failed:', res.status);
      return null;
    }

    const data = await res.json();
    const tracks = data?.tracks?.items || [];
    if (tracks.length === 0) {
      console.log('Spotify search: no results');
      return null;
    }

    // Find best match
    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    for (const track of tracks) {
      const rTitle = (track.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.artists?.[0]?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        console.log('Spotify match:', track.name, 'by', track.artists?.[0]?.name, 'ISRC:', track.external_ids?.isrc);
        // Extract artist name -> Spotify artist ID mapping
        const artistIds: Record<string, string> = {};
        for (const a of (track.artists || [])) {
          if (a.name && a.id) artistIds[a.name.toLowerCase()] = a.id;
        }
        return {
          isrc: track.external_ids?.isrc || null,
          trackId: track.id,
          title: track.name,
          artist: track.artists?.[0]?.name || artist,
          artistIds,
        };
      }
    }

    // No good match found — do NOT fallback to first result (causes wrong song confusion)
    console.log('Spotify search: no matching result found for', title, 'by', artist);
    return null;
  } catch (e) {
    console.log('Spotify search exception:', e);
    return null;
  }
}

/**
 * Search Spotify for an artist by name and return their Spotify artist ID.
 * Used to resolve profile URLs for writers and producers.
 */
async function searchSpotifyArtistId(name: string): Promise<string | null> {
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  try {
    const q = `artist:${name}`;
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=3`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const artists = data?.artists?.items || [];
    if (artists.length === 0) return null;

    const normalName = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    for (const artist of artists) {
      const rName = (artist.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (rName === normalName || rName.includes(normalName) || normalName.includes(rName)) {
        return artist.id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Batch resolve Spotify artist IDs for names that don't already have one.
 * Runs searches in parallel with a concurrency limit.
 */
async function batchResolveSpotifyArtistIds(
  names: string[],
  existingIds: Record<string, string>
): Promise<Record<string, string>> {
  const missing = names.filter(n => !existingIds[n.toLowerCase()]);
  if (missing.length === 0) return existingIds;

  // Limit to 5 concurrent lookups to avoid rate limits
  const uniqueNames = [...new Set(missing.map(n => n.toLowerCase()))];
  const toResolve = uniqueNames.slice(0, 5);

  const results = await Promise.all(
    toResolve.map(async (name) => {
      const id = await searchSpotifyArtistId(name);
      return { name, id };
    })
  );

  const updated = { ...existingIds };
  for (const { name, id } of results) {
    if (id) {
      updated[name] = id;
      console.log(`Resolved Spotify artist ID for "${name}": ${id}`);
    }
  }
  return updated;
}

/**
 * General Spotify search for ambiguous queries without dash separators.
 * Uses Spotify's own search ranking (which accounts for popularity) to disambiguate.
 * E.g. "Noname Room 25" → finds "Room 25" by Noname (the rapper), not "Noname" by some other artist.
 */
async function searchSpotifyGeneral(query: string): Promise<{
  isrc: string | null;
  trackId: string | null;
  title: string;
  artist: string;
} | null> {
  // Try Spotify first
  const token = await getSpotifyAccessToken();
  if (token) {
    try {
      const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
      console.log('Spotify general search:', query);
      const res = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const tracks = data?.tracks?.items || [];
        if (tracks.length > 0) {
          const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
          for (const track of tracks) {
            const combined = `${(track.name || '').toLowerCase()} ${(track.artists || []).map((a: any) => a.name.toLowerCase()).join(' ')}`;
            const matchRatio = queryWords.filter(w => combined.includes(w)).length / queryWords.length;
            if (matchRatio >= 0.5) {
              console.log('Spotify general match:', track.name, 'by', track.artists?.[0]?.name, 'ISRC:', track.external_ids?.isrc);
              return { isrc: track.external_ids?.isrc || null, trackId: track.id, title: track.name, artist: track.artists?.[0]?.name || '' };
            }
          }
          // No good match — do NOT fallback to first result (causes wrong song confusion)
          console.log('Spotify general search: no matching result found for', query);
        }
      } else {
        console.log('Spotify general search failed:', res.status, '- falling back to Deezer');
      }
    } catch (e) {
      console.log('Spotify general search exception:', e);
    }
  }

  // Fallback: Deezer search (no auth required, good disambiguation)
  try {
    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`;
    console.log('Deezer general search fallback:', query);
    const res = await fetch(deezerUrl);
    if (res.ok) {
      const data = await res.json();
      const tracks = data?.data || [];
      if (tracks.length > 0) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
        for (const track of tracks) {
          const combined = `${(track.title || '').toLowerCase()} ${(track.artist?.name || '').toLowerCase()}`;
          const matchRatio = queryWords.filter(w => combined.includes(w)).length / queryWords.length;
          if (matchRatio >= 0.5) {
            // Fetch full track to get ISRC
            let isrc: string | null = null;
            try {
              const trackResp = await fetch(`https://api.deezer.com/track/${track.id}`);
              if (trackResp.ok) {
                const trackData = await trackResp.json();
                isrc = trackData.isrc || null;
              }
            } catch {}
            console.log('Deezer general match:', track.title, 'by', track.artist?.name, 'ISRC:', isrc);
            return { isrc, trackId: null, title: track.title, artist: track.artist?.name || '' };
          }
        }
        // No good match — do NOT fallback to first result (causes wrong song confusion)
        console.log('Deezer general search: no matching result found for', query);
      }
    }
  } catch (e) {
    console.log('Deezer general search exception:', e);
  }

  return null;
}

/**
 * Get track details from Spotify by track ID (for ISRC extraction).
 */
async function getSpotifyTrackById(trackId: string): Promise<{
  isrc: string | null;
  title: string;
  artist: string;
  albumLabel?: string | null;
  albumName?: string | null;
  releaseDate?: string | null;
  artistIds?: Record<string, string>;
} | null> {
  // Try official API first
  const token = await getSpotifyAccessToken();
  if (token) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const albumLabel = data.album?.label || null;
        if (albumLabel) console.log('Spotify album.label:', albumLabel);
        // Extract artist name -> Spotify artist ID mapping
        const artistIds: Record<string, string> = {};
        for (const a of (data.artists || [])) {
          if (a.name && a.id) artistIds[a.name.toLowerCase()] = a.id;
        }
        return {
          isrc: data.external_ids?.isrc || null,
          title: data.name || '',
          artist: data.artists?.[0]?.name || '',
          albumLabel: albumLabel && albumLabel !== '[no label]' ? albumLabel : null,
          albumName: data.album?.name || null,
          releaseDate: data.album?.release_date || null,
          artistIds,
        };
      } else {
        console.log('Spotify track fetch failed:', res.status, '- trying Pathfinder fallback for label');
      }
    } catch (e) {
      console.log('Spotify track fetch exception:', e);
    }
  }

  // Fallback: Pathfinder GraphQL (works without OAuth, bypasses 403)
  try {
    const pfData = await getSpotifyTrackViaPathfinder(trackId);
    if (pfData) {
      return {
        isrc: null,
        title: pfData.title,
        artist: pfData.artist,
        albumLabel: pfData.albumLabel,
        albumName: pfData.albumName,
      };
    }
  } catch (e) {
    console.log('Pathfinder label fallback failed:', e);
  }

  return null;
}

/**
 * Get record label from Deezer API (free, no auth required).
 * Useful fallback when Spotify API is restricted.
 */
async function getDeezerRecordLabel(title: string, artist: string): Promise<string | null> {
  try {
    const q = `${artist} ${title}`.replace(/[()[\]]/g, '');
    const searchRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const tracks = searchData?.data || [];

    const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

    for (const track of tracks) {
      const rTitle = (track.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const rArtist = (track.artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
          (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
        // Fetch album details for label
        if (track.album?.id) {
          const albumRes = await fetch(`https://api.deezer.com/album/${track.album.id}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (albumRes.ok) {
            const albumData = await albumRes.json();
            if (albumData.label && albumData.label !== 'Unknown') {
              console.log('Got record label from Deezer:', albumData.label);
              return albumData.label;
            }
          }
        }
        break;
      }
    }
  } catch (e) {
    console.log('Deezer label lookup failed:', e);
  }
  return null;
}

// ========== STREAMING URL PARSING ==========

function parseStreamingUrl(input: string): ParsedUrl {
  // Handle spotify: URI format
  const spotifyUriMatch = input.match(/^spotify:track:([a-zA-Z0-9]+)/);
  if (spotifyUriMatch) return { platform: 'spotify', id: spotifyUriMatch[1], url: `https://open.spotify.com/track/${spotifyUriMatch[1]}` };

  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.includes('spotify')) {
      // Handle /intl-*/track/ID and /track/ID
      const match = urlObj.pathname.match(/\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]+)/);
      if (match) return { platform: 'spotify', id: match[1], url: input };
    }
    if (hostname.includes('apple') || hostname.includes('itunes')) {
      const trackId = urlObj.searchParams.get('i');
      const songMatch = urlObj.pathname.match(/\/song\/[^/]+\/(\d+)/);
      const albumTrackMatch = urlObj.pathname.match(/\/album\/[^/]+\/(\d+)/);
      const resolvedId = trackId || songMatch?.[1] || albumTrackMatch?.[1];
      return { platform: 'apple', id: resolvedId, url: input };
    }
    if (hostname.includes('tidal')) {
      // Handle /browse/track/ID and /track/ID
      const match = urlObj.pathname.match(/\/(?:browse\/)?track\/(\d+)/);
      if (match) return { platform: 'tidal', id: match[1], url: input };
    }
    if (hostname.includes('deezer')) {
      // Handle /track/ID and /en/track/ID etc.
      const match = urlObj.pathname.match(/\/(?:[a-z]{2}\/)?track\/(\d+)/);
      if (match) return { platform: 'deezer', id: match[1], url: input };
    }
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') || 
        (hostname.includes('youtu.be') ? urlObj.pathname.slice(1).split('/')[0] : null);
      if (videoId) return { platform: 'youtube', id: videoId, url: input };
    }
    if (hostname.includes('amazon')) {
      // Try to extract ASIN or track path for Amazon Music
      const asinMatch = urlObj.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      return { platform: 'amazon', id: asinMatch?.[1], url: input };
    }
    return { platform: 'search', query: input };
  } catch {
    return { platform: 'search', query: input };
  }
}

// ========== ISRC EXTRACTION ==========

// Extract ISRC from Deezer (via Odesli link or search), then Spotify API as fallback
async function extractIsrc(data: any, title?: string, artist?: string): Promise<{ isrc: string | null; spotifyTrackId: string | null }> {
  let spotifyTrackId: string | null = null;

  // Strategy 1: Deezer via Odesli link
  const deezerLink = data?.linksByPlatform?.deezer?.url;
  if (deezerLink) {
    const deezerIdMatch = deezerLink.match(/\/track\/(\d+)/);
    if (deezerIdMatch) {
      try {
        console.log('Fetching ISRC from Deezer API for track:', deezerIdMatch[1]);
        const deezerResp = await fetch(`https://api.deezer.com/track/${deezerIdMatch[1]}`);
        if (deezerResp.ok) {
          const deezerData = await deezerResp.json();
          if (deezerData.isrc) {
            console.log('Got ISRC from Deezer (Odesli link):', deezerData.isrc);
            // Also extract Spotify track ID from Odesli
            const spotifyLink = data?.linksByPlatform?.spotify?.url;
            if (spotifyLink) {
              const m = spotifyLink.match(/\/track\/([a-zA-Z0-9]+)/);
              if (m) spotifyTrackId = m[1];
            }
            return { isrc: deezerData.isrc, spotifyTrackId };
          }
        }
      } catch (e) {
        console.log('Deezer ISRC fetch failed:', e);
      }
    }
  }

  // Extract Spotify track ID from Odesli data regardless
  const spotifyLink = data?.linksByPlatform?.spotify?.url;
  if (spotifyLink) {
    const m = spotifyLink.match(/\/track\/([a-zA-Z0-9]+)/);
    if (m) spotifyTrackId = m[1];
  }

  // Strategy 2: Deezer search by title+artist
  if (title && artist) {
    try {
      const searchQuery = `${artist} ${title}`.replace(/[()[\]]/g, '');
      const deezerSearchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=5`;
      console.log('Deezer ISRC fallback search:', searchQuery);
      const searchResp = await fetch(deezerSearchUrl);
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        if (searchData?.data?.length > 0) {
          const normalTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          const normalArtist = artist.toLowerCase().split(/[,&]|feat\.|ft\./i)[0].trim().replace(/[^\p{L}\p{N}]/gu, '');

          for (const result of searchData.data) {
            const rTitle = (result.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            const rArtist = (result.artist?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            if ((rTitle.includes(normalTitle) || normalTitle.includes(rTitle)) &&
                (rArtist.includes(normalArtist) || normalArtist.includes(rArtist))) {
              const trackResp = await fetch(`https://api.deezer.com/track/${result.id}`);
              if (trackResp.ok) {
                const trackData = await trackResp.json();
                if (trackData.isrc) {
                  console.log('Got ISRC from Deezer search:', trackData.isrc);
                  return { isrc: trackData.isrc, spotifyTrackId };
                }
              }
              break;
            }
          }

          // No good match — do NOT fallback to first result (causes ISRC confusion)
          console.log('Deezer ISRC search: no matching result found');
        }
      }
    } catch (e) {
      console.log('Deezer ISRC search failed:', e);
    }
  }

  // Strategy 3: Spotify API search (Client Credentials)
  if (title && artist) {
    try {
      const spotifyResult = await searchSpotifyTrack(title, artist);
      if (spotifyResult) {
        if (!spotifyTrackId && spotifyResult.trackId) {
          spotifyTrackId = spotifyResult.trackId;
        }
        if (spotifyResult.isrc) {
          console.log('Got ISRC from Spotify API:', spotifyResult.isrc);
          return { isrc: spotifyResult.isrc, spotifyTrackId };
        }
      }
    } catch (e) {
      console.log('Spotify ISRC search failed:', e);
    }
  }

  return { isrc: null, spotifyTrackId };
}

// ========== PLATFORM-SPECIFIC INFO EXTRACTION ==========

function cleanMarkdownText(text: string): string {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpotifyTrackMarkdown(markdown: string): { title: string; artist: string } | null {
  const lines = String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = lines[i].match(/^#\s+(.+)$/);
    if (!titleMatch) continue;

    const title = cleanMarkdownText(titleMatch[1]);
    if (!title) continue;

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const artistMatch = lines[j].match(/^\[([^\]]+)\]\(https?:\/\/open\.spotify\.com\/artist\/[^^\)]+\)/i);
      if (!artistMatch) continue;

      const artist = cleanMarkdownText(artistMatch[1]);
      if (artist) {
        return { title, artist };
      }
    }
  }

  return null;
}

async function scrapeSpotifyTrackPage(trackId: string): Promise<ExtractedSongInfo | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return null;

  const spotifyUrl = `https://open.spotify.com/track/${trackId}`;

  try {
    console.log('Scraping Spotify track page for metadata:', spotifyUrl);
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: spotifyUrl,
        formats: ['markdown'],
        onlyMainContent: false,
      }),
    });

    if (!scrapeResponse.ok) {
      console.log('Spotify Firecrawl metadata scrape failed:', scrapeResponse.status);
      return null;
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData?.data?.markdown || '';
    const parsed = parseSpotifyTrackMarkdown(markdown);

    if (!parsed) {
      console.log('Spotify Firecrawl scrape did not yield title + artist for track:', trackId);
      return null;
    }

    const { isrc } = await extractIsrc({}, parsed.title, parsed.artist);
    console.log('Spotify Firecrawl metadata:', parsed.title, 'by', parsed.artist, 'ISRC:', isrc);

    return {
      title: parsed.title,
      artist: parsed.artist,
      platform: 'spotify',
      isrc: isrc || undefined,
      spotifyTrackId: trackId,
    };
  } catch (error) {
    console.log('Spotify Firecrawl scrape exception:', error);
    return null;
  }
}

async function fetchSpotifyInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    // Exact source 1: official Spotify API by track ID
    const spotifyTrackData = await getSpotifyTrackById(trackId);
    if (spotifyTrackData && spotifyTrackData.title && spotifyTrackData.artist) {
      console.log('Got Spotify info via API:', spotifyTrackData.title, 'by', spotifyTrackData.artist, 'ISRC:', spotifyTrackData.isrc);

      let isrc = spotifyTrackData.isrc;
      if (!isrc) {
        const extracted = await extractIsrc({}, spotifyTrackData.title, spotifyTrackData.artist);
        isrc = extracted.isrc;
      }

      return {
        title: spotifyTrackData.title,
        artist: spotifyTrackData.artist,
        platform: 'spotify',
        isrc: isrc || undefined,
        spotifyTrackId: trackId,
      };
    }

    // Exact source 2: Spotify web player Pathfinder query by track ID
    const pathfinderTrackData = await getSpotifyTrackViaPathfinder(trackId);
    if (pathfinderTrackData?.title && pathfinderTrackData?.artist) {
      const extracted = await extractIsrc({}, pathfinderTrackData.title, pathfinderTrackData.artist);
      return {
        title: pathfinderTrackData.title,
        artist: pathfinderTrackData.artist,
        platform: 'spotify',
        isrc: extracted.isrc || undefined,
        spotifyTrackId: trackId,
      };
    }

    // Exact source 3: Odesli cross-platform resolution
    try {
      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
      const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
      console.log('Spotify link fallback via Odesli:', odesliUrl);
      const odesliResp = await fetchOdesliWithRetry(odesliUrl);
      if (odesliResp.ok) {
        const odesliData = await odesliResp.json();
        const entityId = odesliData.entityUniqueId;
        const entity = odesliData.entitiesByUniqueId?.[entityId];
        if (entity?.title && entity?.artistName) {
          console.log('Odesli resolved Spotify track:', entity.title, 'by', entity.artistName);
          const { isrc } = await extractIsrc(odesliData, entity.title, entity.artistName);
          return {
            title: entity.title,
            artist: entity.artistName,
            platform: 'spotify',
            isrc: isrc || undefined,
            spotifyTrackId: trackId,
          };
        }
      } else {
        console.log('Odesli Spotify fallback failed:', odesliResp.status);
        // Body may already be consumed by retry helper; safely try to consume
        try { await odesliResp.text(); } catch {}
      }
    } catch (e) {
      console.log('Odesli Spotify fallback exception:', e);
    }

    // Exact source 4: Firecrawl scrape of Spotify track page
    const scraped = await scrapeSpotifyTrackPage(trackId);
    if (scraped) {
      console.log('Firecrawl scrape resolved Spotify track:', scraped.title, 'by', scraped.artist);
      return scraped;
    }

    // Exact source 5: Deezer search as final fallback (free, no auth, no rate limits)
    // Use Odesli's known Spotify→Deezer mapping or search by track ID context
    try {
      // We don't know title/artist yet, but we can try a Deezer search via the Spotify URL
      // by querying the track ID through an alternative route
      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
      // Try the embed page which sometimes has metadata in the HTML
      const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
      console.log('Trying Spotify embed page for metadata:', embedUrl);
      const embedResp = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (embedResp.ok) {
        const html = await embedResp.text();
        // Extract title and artist from meta tags or JSON-LD
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                             html.match(/content="([^"]+)"\s+property="og:title"/i);
        const ogDescMatch = html.match(/property="og:description"\s+content="([^"]+)"/i) ||
                            html.match(/content="([^"]+)"\s+property="og:description"/i);

        let embedTitle = '';
        let embedArtist = '';

        // og:title usually has the track name
        if (ogTitleMatch) embedTitle = ogTitleMatch[1].trim();
        // og:description usually has the artist
        if (ogDescMatch) embedArtist = ogDescMatch[1].replace(/· Song · \d+$/, '').replace(/· Song$/, '').trim();

        // Fallback: parse <title> which is usually "Track - Artist | Spotify"
        if (!embedTitle && titleMatch) {
          const titleText = titleMatch[1].replace(/\s*\|\s*Spotify\s*$/, '').replace(/\s*-\s*song and lyrics by\s*/i, ' - ');
          const parts = titleText.split(/\s+-\s+/);
          if (parts.length >= 2) {
            embedTitle = parts[0].trim();
            embedArtist = parts[1].trim();
          }
        }

        if (embedTitle && embedArtist) {
          console.log('Spotify embed resolved:', embedTitle, 'by', embedArtist);
          const { isrc } = await extractIsrc({}, embedTitle, embedArtist);
          return {
            title: embedTitle,
            artist: embedArtist,
            platform: 'spotify',
            isrc: isrc || undefined,
            spotifyTrackId: trackId,
          };
        }
      } else {
        console.log('Spotify embed page failed:', embedResp.status);
        await embedResp.text();
      }
    } catch (e) {
      console.log('Spotify embed fallback exception:', e);
    }

    console.log('Spotify link lookup failed closed: no exact metadata source available for track:', trackId);
    return null;
  } catch (error) {
    console.error('Error fetching Spotify info:', error);
    return null;
  }
}

async function fetchAppleMusicInfo(url: string, trackId?: string): Promise<ExtractedSongInfo | null> {
  try {
    // Priority 1: iTunes Lookup API with track ID (most reliable for ?i= links)
    if (trackId) {
      try {
        const itunesUrl = `https://itunes.apple.com/lookup?id=${trackId}&entity=song`;
        console.log('Fetching Apple Music via iTunes Lookup API:', itunesUrl);
        const itunesResp = await fetch(itunesUrl);
        if (itunesResp.ok) {
          const itunesData = await itunesResp.json();
          const track = itunesData?.results?.find((r: any) => r.wrapperType === 'track' && r.kind === 'song');
          if (track?.trackName && track?.artistName) {
            console.log('iTunes Lookup resolved:', track.trackName, 'by', track.artistName);
            // Now get ISRC via Spotify search
            const spotifyResult = await searchSpotifyTrack(track.trackName, track.artistName);
            return {
              title: track.trackName,
              artist: track.artistName,
              platform: 'apple',
              isrc: spotifyResult?.isrc || undefined,
              spotifyTrackId: spotifyResult?.trackId || undefined,
            };
          }
        }
      } catch (e) { console.log('iTunes Lookup API failed:', e); }
    }

    // Priority 2: Odesli
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Apple Music via Odesli:', odesliUrl);

    const response = await fetchOdesliWithRetry(odesliUrl);
    if (response.ok) {
      const data = await response.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      
      // If we have a trackId, verify Odesli resolved the right track
      if (trackId && entity) {
        // Check if Odesli's Apple Music entity matches our track ID
        const odesliAppleUrl = data?.linksByPlatform?.appleMusic?.url || data?.linksByPlatform?.itunes?.url || '';
        const odesliTrackId = new URL(odesliAppleUrl).searchParams.get('i') || odesliAppleUrl.match(/\/(\d+)$/)?.[1];
        if (odesliTrackId && odesliTrackId !== trackId) {
          console.log(`Odesli resolved wrong track: expected ${trackId}, got ${odesliTrackId}. Skipping Odesli result.`);
          // Don't use this result - it's the wrong track
        } else {
          const { isrc, spotifyTrackId } = await extractIsrc(data, entity?.title, entity?.artistName);
          if (entity.title) {
            return {
              title: entity.title || '',
              artist: entity.artistName || '',
              platform: 'apple',
              isrc: isrc || undefined,
              spotifyTrackId: spotifyTrackId || undefined,
            };
          }
        }
      } else {
        const { isrc, spotifyTrackId } = await extractIsrc(data, entity?.title, entity?.artistName);
        if (entity && entity.title) {
          return {
            title: entity.title || '',
            artist: entity.artistName || '',
            platform: 'apple',
            isrc: isrc || undefined,
            spotifyTrackId: spotifyTrackId || undefined,
          };
        }
      }
    }

    // Fallback: Firecrawl scrape
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (apiKey) {
      try {
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false }),
        });
        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          const metadata = scrapeData?.data?.metadata || {};
          if (metadata.title) {
            const titleParts = metadata.title.split(' - ');
            if (titleParts.length >= 2) {
              return {
                title: titleParts[0].trim(),
                artist: titleParts[1].trim().replace(' on Apple Music', '').replace(' - Apple Music', ''),
                platform: 'apple'
              };
            }
          }
        }
      } catch (e) { console.log('Firecrawl fallback failed:', e); }
    }

    return null;
  } catch (error) {
    console.error('Error fetching Apple Music info:', error);
    return null;
  }
}

async function fetchTidalInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://tidal.com/browse/track/${trackId}`;
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Tidal via Odesli:', odesliUrl);

    const odesliResponse = await fetchOdesliWithRetry(odesliUrl);
    if (odesliResponse.ok) {
      const data = await odesliResponse.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      const { isrc, spotifyTrackId } = await extractIsrc(data, entity?.title, entity?.artistName);

      if (entity && entity.title && entity.artistName) {
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'tidal',
          isrc: isrc || undefined,
          spotifyTrackId: spotifyTrackId || undefined,
        };
      }
    }

    // Fallback to oEmbed
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    if (!response.ok) return null;
    const data = await response.json();
    return { title: data.title || '', artist: data.author_name || '', platform: 'tidal' };
  } catch (error) {
    console.error('Error fetching Tidal info:', error);
    return null;
  }
}

async function fetchDeezerInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    console.log('Fetching Deezer info for track:', trackId);
    const response = await fetch(`https://api.deezer.com/track/${trackId}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.error) return null;

    // Also get Spotify track ID via search
    let spotifyTrackId: string | null = null;
    if (data.title && data.artist?.name) {
      const spotifyResult = await searchSpotifyTrack(data.title, data.artist.name);
      if (spotifyResult?.trackId) spotifyTrackId = spotifyResult.trackId;
    }

    return {
      title: data.title || '',
      artist: data.artist?.name || '',
      platform: 'deezer',
      isrc: data.isrc || undefined,
      spotifyTrackId: spotifyTrackId || undefined,
    };
  } catch (error) {
    console.error('Error fetching Deezer info:', error);
    return null;
  }
}

async function fetchYouTubeInfo(videoId: string): Promise<ExtractedSongInfo | null> {
  try {
    // Try Odesli first - it handles YouTube links well
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching YouTube via Odesli:', odesliUrl);

    const response = await fetchOdesliWithRetry(odesliUrl);
    if (response.ok) {
      const data = await response.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      const { isrc, spotifyTrackId } = await extractIsrc(data, entity?.title, entity?.artistName);

      if (entity?.title && entity?.artistName) {
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'youtube',
          isrc: isrc || undefined,
          spotifyTrackId: spotifyTrackId || undefined,
        };
      }
    }

    // Fallback: YouTube oEmbed
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const oembedResp = await fetch(oembedUrl);
    if (oembedResp.ok) {
      const oembed = await oembedResp.json();
      // oEmbed title is often "Artist - Title" or just the video title
      const title = oembed.title || '';
      const author = oembed.author_name || '';
      const dashParts = title.split(/\s*[-–—]\s*/);
      if (dashParts.length >= 2) {
        return { title: dashParts.slice(1).join(' - ').replace(/\s*\(.*?\)\s*/g, '').trim(), artist: dashParts[0].trim(), platform: 'youtube' };
      }
      return { title: title.replace(/\s*\(.*?\)\s*/g, '').trim(), artist: author, platform: 'youtube' };
    }

    return null;
  } catch (error) {
    console.error('Error fetching YouTube info:', error);
    return null;
  }
}

async function fetchAmazonMusicInfo(url: string): Promise<ExtractedSongInfo | null> {
  try {
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Amazon Music via Odesli:', odesliUrl);

    const response = await fetchOdesliWithRetry(odesliUrl);
    if (response.ok) {
      const data = await response.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      const { isrc, spotifyTrackId } = await extractIsrc(data, entity?.title, entity?.artistName);

      if (entity?.title && entity?.artistName) {
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'amazon',
          isrc: isrc || undefined,
          spotifyTrackId: spotifyTrackId || undefined,
        };
      }
    }

    // Fallback: Firecrawl scrape for Amazon Music page
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (apiKey) {
      try {
        console.log('Trying Firecrawl scrape for Amazon Music:', url);
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 3000 }),
        });
        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          const metadata = scrapeData?.data?.metadata || {};
          const markdown = scrapeData?.data?.markdown || '';
          
          // Try metadata title first (often "Song - Artist - Amazon Music")
          if (metadata.title) {
            const cleaned = metadata.title.replace(/\s*[-–—]\s*Amazon Music.*$/i, '').trim();
            const parts = cleaned.split(/\s*[-–—]\s*/);
            if (parts.length >= 2) {
              const title = parts[0].trim();
              const artist = parts[1].trim();
              if (title && artist) {
                console.log('Amazon scrape resolved via metadata:', title, 'by', artist);
                const spotifyResult = await searchSpotifyTrack(title, artist);
                return {
                  title: spotifyResult?.title || title,
                  artist: spotifyResult?.artist || artist,
                  platform: 'amazon',
                  isrc: spotifyResult?.isrc || undefined,
                  spotifyTrackId: spotifyResult?.trackId || undefined,
                };
              }
            }
          }

          // Try og:title from metadata
          if (metadata.ogTitle) {
            const cleaned = metadata.ogTitle.replace(/\s*[-–—]\s*Amazon Music.*$/i, '').trim();
            const parts = cleaned.split(/\s*by\s*/i);
            if (parts.length >= 2) {
              const title = parts[0].trim();
              const artist = parts[1].trim();
              if (title && artist) {
                console.log('Amazon scrape resolved via og:title:', title, 'by', artist);
                const spotifyResult = await searchSpotifyTrack(title, artist);
                return {
                  title: spotifyResult?.title || title,
                  artist: spotifyResult?.artist || artist,
                  platform: 'amazon',
                  isrc: spotifyResult?.isrc || undefined,
                  spotifyTrackId: spotifyResult?.trackId || undefined,
                };
              }
            }
          }
        }
      } catch (e) { console.log('Amazon Firecrawl fallback failed:', e); }
    }

    return null;
  } catch (error) {
    console.error('Error fetching Amazon Music info:', error);
    return null;
  }
}

async function extractSongFromLink(parsed: ParsedUrl): Promise<ExtractedSongInfo | null> {
  console.log('Extracting song info from:', parsed.platform, parsed.id || parsed.url);
  switch (parsed.platform) {
    case 'spotify': if (parsed.id) return fetchSpotifyInfo(parsed.id); break;
    case 'apple': if (parsed.url) return fetchAppleMusicInfo(parsed.url, parsed.id); break;
    case 'tidal': if (parsed.id) return fetchTidalInfo(parsed.id); break;
    case 'deezer': if (parsed.id) return fetchDeezerInfo(parsed.id); break;
    case 'youtube': if (parsed.id) return fetchYouTubeInfo(parsed.id); break;
    case 'amazon': if (parsed.url) return fetchAmazonMusicInfo(parsed.url); break;
  }
  return null;
}

// ========== MAIN HANDLER ==========

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, filterPros, skipPro } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (query.length > 1000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query too long (max 1000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Song lookup for:', query);

    const parsed = parseStreamingUrl(query);
    let searchQuery = parsed.query || query;
    let extractedInfo: ExtractedSongInfo | null = null;

    // If it's a streaming link, extract song info
    if (parsed.platform !== 'search' && (parsed.id || parsed.url)) {
      console.log('Detected streaming link, extracting song info...');
      extractedInfo = await extractSongFromLink(parsed);

      if (!extractedInfo || !extractedInfo.title || !extractedInfo.artist) {
        console.log('Link lookup aborted: could not extract exact title + artist from link metadata');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Could not verify the exact song from this link. Please try again in a moment or search using artist - title.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Extracted info:', JSON.stringify(extractedInfo));
      searchQuery = `${extractedInfo.artist} - ${extractedInfo.title}`;
    }

    // For text searches, try to get Spotify track ID + ISRC via Spotify API
    if (parsed.platform === 'search' && !extractedInfo) {
      const parts = searchQuery.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        // Has a dash separator: "Artist - Title"
        const artist = parts[0].trim();
        const title = parts.slice(1).join(' - ').trim();
        if (artist && title) {
          console.log('Text search (dash): trying Spotify API for ISRC...');
          const spotifyResult = await searchSpotifyTrack(title, artist);
          if (spotifyResult) {
            extractedInfo = {
              title: spotifyResult.title || title,
              artist: spotifyResult.artist || artist,
              platform: 'search',
              isrc: spotifyResult.isrc || undefined,
              spotifyTrackId: spotifyResult.trackId || undefined,
            };
            console.log('Spotify API found for text search:', JSON.stringify(extractedInfo));
          }
        }
      } else {
        // No dash separator: use Spotify general search to disambiguate
        // This handles queries like "Noname Room 25", "Clairo Sofia", etc.
        console.log('Text search (no dash): trying Spotify general search for disambiguation...');
        const spotifyGeneralResult = await searchSpotifyGeneral(searchQuery);
        if (spotifyGeneralResult) {
          extractedInfo = {
            title: spotifyGeneralResult.title,
            artist: spotifyGeneralResult.artist,
            platform: 'search',
            isrc: spotifyGeneralResult.isrc || undefined,
            spotifyTrackId: spotifyGeneralResult.trackId || undefined,
          };
          // Update searchQuery with properly separated artist - title for MB
          searchQuery = `${spotifyGeneralResult.artist} - ${spotifyGeneralResult.title}`;
          console.log('Spotify general search resolved:', JSON.stringify(extractedInfo), 'Updated query:', searchQuery);
        }
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Step 1: MusicBrainz lookup (ISRC priority, then text)
    const callMusicBrainz = async (q: string, isrc?: string) => {
      const body: { query?: string; isrc?: string } = {};
      if (isrc) { body.isrc = isrc; console.log('Calling MB with ISRC:', isrc); }
      else { body.query = q; console.log('Calling MB with query:', q); }

      const r = await fetch(`${supabaseUrl}/functions/v1/musicbrainz-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      console.log('MusicBrainz response:', JSON.stringify(j).substring(0, 1000));
      return j;
    };

    // Start Odesli cross-link fetch early (in parallel with MB)
    let odesliCrossLinkPromise: Promise<{ appleMusicUrl: string | null; spotifyTrackId: string | null } | null> | null = null;
    if (typeof query === 'string' && query.startsWith('http')) {
      odesliCrossLinkPromise = (async () => {
        try {
          const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}`;
          const odesliResp = await fetchOdesliWithRetry(odesliUrl);
          if (odesliResp.ok) {
            const odesliData = await odesliResp.json();
            let aUrl = odesliData?.linksByPlatform?.appleMusic?.url || odesliData?.linksByPlatform?.itunes?.url || null;
            if (!aUrl && odesliData?.linksByPlatform) {
              for (const [key, link] of Object.entries(odesliData.linksByPlatform)) {
                if (String(key).toLowerCase().includes('apple') && (link as any)?.url) {
                  aUrl = String((link as any).url);
                  break;
                }
              }
            }
            // Extract Spotify track ID from Odesli
            let sId: string | null = null;
            const sLink = odesliData?.linksByPlatform?.spotify?.url;
            if (sLink) {
              const m = sLink.match(/\/track\/([a-zA-Z0-9]+)/);
              if (m) sId = m[1];
            }
            return { appleMusicUrl: aUrl, spotifyTrackId: sId };
          }
        } catch (e) { console.log('Early Odesli cross-link fetch failed:', e); }
        return null;
      })();
    }

    // Try ISRC lookup first
    let mbData: any = null;
    let usedIsrc = false;

    if (extractedInfo?.isrc) {
      console.log('Attempting ISRC lookup:', extractedInfo.isrc);
      mbData = await callMusicBrainz('', extractedInfo.isrc);
      if (mbData?.success && mbData?.data) {
        usedIsrc = true;
        console.log('ISRC lookup succeeded:', mbData.data.title);
        // CRITICAL: When ISRC matches, MB is authoritative. Update extractedInfo
        // to match MB's canonical title/artist so downstream enrichment queries
        // (Genius, Discogs, Apple, Spotify credits) use the correct song identity.
        const mbTitle = mbData.data.title;
        const mbArtist = mbData.data.artists?.[0]?.name;
        if (mbTitle && mbArtist) {
          console.log('Aligning extractedInfo to MB result:', mbTitle, 'by', mbArtist);
          extractedInfo.title = mbTitle;
          extractedInfo.artist = mbArtist;
          searchQuery = `${mbArtist} - ${mbTitle}`;
        }
      } else {
        console.log('ISRC lookup failed, falling back to text search');
        mbData = null;
      }
    }

    if (!mbData) {
      mbData = await callMusicBrainz(searchQuery);
    }

    // Retry with looser queries
    if (mbData?.success && !mbData?.data) {
      const fallbacks: string[] = [];
      if (extractedInfo?.artist && extractedInfo?.title) {
        fallbacks.push(`${extractedInfo.artist} ${extractedInfo.title}`);
      } else {
        fallbacks.push(String(searchQuery).trim());
      }
      for (const fb of fallbacks) {
        if (!fb || fb === searchQuery) continue;
        console.log('Retrying MB with fallback:', fb);
        mbData = await callMusicBrainz(fb);
        if (mbData?.success && mbData?.data) break;
      }
    }

    // Normalize for comparison
    const normalizeForComparison = (text: string): string => {
      return text.toLowerCase().trim()
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
        .replace(/[''`´]/g, "'").replace(/[""„]/g, '"')
        .replace(/\s+/g, ' ')
        .replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ')
        .trim();
    };

    const isMatchingResult = (mbResult: any, extracted: ExtractedSongInfo | null): boolean => {
      if (!extracted || !mbResult?.data) return true;
      const mbTitle = normalizeForComparison(String(mbResult.data.title || ''));
      const mbArtist = normalizeForComparison(String(mbResult.data.artists?.[0]?.name || ''));
      const extractedTitle = normalizeForComparison(String(extracted.title || ''));
      const extractedArtist = normalizeForComparison(String(extracted.artist || ''));

      if (!extractedTitle || !mbTitle) return false;

      const titleMatch = mbTitle.includes(extractedTitle) || extractedTitle.includes(mbTitle);
      if (!titleMatch) return false;

      if (!extractedArtist) {
        return false;
      }

      return mbArtist.includes(extractedArtist) || extractedArtist.includes(mbArtist);
    };

    let useFallbackData = false;
    if (!usedIsrc && mbData?.success && mbData?.data && extractedInfo) {
      if (!isMatchingResult(mbData, extractedInfo)) {
        // MB text search returned a different song than what Spotify/Deezer guessed.
        // For text searches from links, trust extractedInfo (from the actual link).
        // For plain text searches, trust MB (Spotify general search may have guessed wrong).
        if (parsed.platform !== 'search') {
          console.log('MusicBrainz returned different song than link! Using link data as primary.');
          useFallbackData = true;
        } else {
          // For text searches, MB is more likely correct. Align extractedInfo to MB.
          console.log('MusicBrainz returned different song than Spotify guess. Trusting MB result.');
          const mbTitle = mbData.data.title;
          const mbArtist = mbData.data.artists?.[0]?.name;
          if (mbTitle && mbArtist && extractedInfo) {
            extractedInfo.title = mbTitle;
            extractedInfo.artist = mbArtist;
            searchQuery = `${mbArtist} - ${mbTitle}`;
          }
        }
      }
    }

    // Determine Spotify track ID for enrichment
    let spotifyTrackId = extractedInfo?.spotifyTrackId || (parsed.platform === 'spotify' ? parsed.id : null);
    // Map of artist name (lowercase) -> Spotify artist ID for direct profile links
    let spotifyArtistIds: Record<string, string> = {};
    // Map of artist name (lowercase) -> Apple Music artist ID for direct profile links
    let appleArtistIds: Record<string, string> = {};

    // ========== ODESLI FALLBACK PATH ==========
    if ((!mbData?.success || !mbData?.data || useFallbackData) && extractedInfo) {
      console.log('Using Odesli-extracted data as primary source');

      let coverUrl: string | null = null;
      let appleMusicUrl: string | null = null;

      try {
        const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}`;
        const odesliResp = await fetchOdesliWithRetry(odesliUrl);
        if (odesliResp.ok) {
          const odesliData = await odesliResp.json();
          const entityId = odesliData.entityUniqueId;
          const entity = odesliData.entitiesByUniqueId?.[entityId];
          if (entity?.thumbnailUrl) coverUrl = entity.thumbnailUrl;
          appleMusicUrl = odesliData?.linksByPlatform?.appleMusic?.url || null;
          // Get Spotify track ID from Odesli
          if (!spotifyTrackId) {
            const sLink = odesliData?.linksByPlatform?.spotify?.url;
            if (sLink) {
              const m = sLink.match(/\/track\/([a-zA-Z0-9]+)/);
              if (m) spotifyTrackId = m[1];
            }
          }
        }
      } catch (e) { console.log('Could not fetch Odesli data:', e); }

      // If still no Spotify track ID, search Spotify API
      if (!spotifyTrackId && extractedInfo.title && extractedInfo.artist) {
        const spotResult = await searchSpotifyTrack(extractedInfo.title, extractedInfo.artist);
        if (spotResult?.trackId) spotifyTrackId = spotResult.trackId;
        if (spotResult?.artistIds) spotifyArtistIds = { ...spotifyArtistIds, ...spotResult.artistIds };
      }

      const artistNames = extractedInfo.artist
        .split(/[,&]|feat\.|ft\.|featuring/i)
        .map((n: string) => n.trim())
        .filter((n: string) => n.length > 0);

      let geniusProducers: Array<{ name: string; role: 'producer' }> = [];
      let geniusWriters: Array<{ name: string; role: 'writer' }> = [];
      let fallbackAlbum: string | null = null;
      let fallbackReleaseDate: string | null = null;
      let fallbackRecordLabel: string | null = null;

      // Try to get record label from Spotify API (most accurate source)
      if (spotifyTrackId) {
        try {
          const spotTrack = await getSpotifyTrackById(spotifyTrackId);
          if (spotTrack?.albumLabel) {
            fallbackRecordLabel = spotTrack.albumLabel;
            console.log('Got record label from Spotify/Pathfinder:', fallbackRecordLabel);
          }
          if (!fallbackAlbum && spotTrack?.albumName) {
            fallbackAlbum = spotTrack.albumName;
          }
          if (!fallbackReleaseDate && spotTrack?.releaseDate) {
            fallbackReleaseDate = spotTrack.releaseDate;
            console.log('Got release date from Spotify:', fallbackReleaseDate);
          }
          if (spotTrack?.artistIds) spotifyArtistIds = { ...spotifyArtistIds, ...spotTrack.artistIds };
        } catch (e) { console.log('Spotify label fetch failed:', e); }
      }

      // Deezer label fallback if Spotify didn't return a label
      if (!fallbackRecordLabel && extractedInfo.title && extractedInfo.artist) {
        const deezerLabel = await getDeezerRecordLabel(extractedInfo.title, extractedInfo.artist);
        if (deezerLabel) {
          fallbackRecordLabel = deezerLabel;
        }
      }

      // Fetch Apple Music artist IDs via iTunes Search API (Odesli path)
      if (extractedInfo.title && extractedInfo.artist) {
        try {
          const itunesQ = `${extractedInfo.artist} ${extractedInfo.title}`;
          const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesQ)}&entity=song&limit=5`;
          const itunesResp = await fetch(itunesSearchUrl);
          if (itunesResp.ok) {
            const itunesData = await itunesResp.json();
            for (const result of (itunesData?.results || [])) {
              if (result?.artistName && result?.artistId) {
                const key = result.artistName.toLowerCase();
                if (!appleArtistIds[key]) {
                  appleArtistIds[key] = String(result.artistId);
                }
              }
            }
            if (Object.keys(appleArtistIds).length > 0) {
              console.log('Apple Music artist IDs captured (Odesli path):', JSON.stringify(appleArtistIds));
            }
          }
        } catch (e) { console.log('iTunes artist ID lookup failed (Odesli path):', e); }
      }

      console.log('Fetching credits from all sources in parallel (Odesli fallback)...');

      const enrichPromises: Promise<{ source: string; data: any }>[] = [];

      // Genius
      enrichPromises.push(
        fetch(`${supabaseUrl}/functions/v1/genius-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ title: extractedInfo.title, artist: artistNames[0] }),
        }).then(r => r.json()).then(data => ({ source: 'genius', data }))
          .catch(e => { console.log('Genius failed:', e); return { source: 'genius', data: null }; })
      );

      // Discogs
      enrichPromises.push(
        fetch(`${supabaseUrl}/functions/v1/discogs-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ title: extractedInfo.title, artist: artistNames[0] }),
        }).then(r => r.json()).then(data => ({ source: 'discogs', data }))
          .catch(e => { console.log('Discogs failed:', e); return { source: 'discogs', data: null }; })
      );

      // Apple Music credits
      if (appleMusicUrl) {
        enrichPromises.push(
          fetch(`${supabaseUrl}/functions/v1/apple-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ url: appleMusicUrl }),
          }).then(r => r.json()).then(data => ({ source: 'apple', data }))
            .catch(e => { console.log('Apple failed:', e); return { source: 'apple', data: null }; })
        );
      }

      // Spotify credits - ALWAYS try if we have a track ID
      if (spotifyTrackId) {
        enrichPromises.push(
          fetch(`${supabaseUrl}/functions/v1/spotify-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ trackId: spotifyTrackId, songTitle: extractedInfo.title, artist: extractedInfo.artist }),
          }).then(r => r.json()).then(data => ({ source: 'spotify', data }))
            .catch(e => { console.log('Spotify failed:', e); return { source: 'spotify', data: null }; })
        );
      }

      const enrichResults = await Promise.all(enrichPromises);
      console.log('Parallel enrichment completed:', enrichResults.map(r => r.source));

      // ========== SPOTIFY-FIRST CREDIT FILTERING (Odesli path) ==========
      // Spotify credits are AUTHORITATIVE — but ONLY for the role(s) Spotify actually
      // returned, and ONLY when the inner creditsSource is a real Spotify channel.
      // The wrapper function (`spotify-credits-lookup`) can fall back to genius/deezer/ai
      // internally; those must be reclassified under their real source so a hallucination
      // never flows in as if it came from Spotify.
      const writersBySource: Record<string, Set<string>> = {};
      const producersBySource: Record<string, Set<string>> = {};
      let spotifyWritersAuthoritative = false;
      let spotifyProducersAuthoritative = false;

      // Reclassify any wrapper response whose internal source is NOT a real Spotify channel.
      const normalizedEnrich = enrichResults.map(({ source, data }) => {
        if (source === 'spotify' && data?.success && data?.data?.creditsSource) {
          const cs = data.data.creditsSource;
          if (cs !== 'spotify-internal' && cs !== 'spotify-pathfinder' && cs !== 'spotify-scrape' && cs !== 'spotify-webapi') {
            // The wrapper fell back internally — tag the credits with their true origin
            // so they cannot masquerade as Spotify-confirmed credits.
            const reclassified = cs === 'genius' ? 'genius' : cs === 'deezer' ? 'deezer' : 'ai';
            return { source: reclassified, data, _spotifyArtistIds: data.artistIds };
          }
        }
        return { source, data, _spotifyArtistIds: source === 'spotify' ? data?.artistIds : undefined };
      });

      for (const { source, data, _spotifyArtistIds } of normalizedEnrich) {
        console.log(`${source} response (Odesli fallback):`, JSON.stringify(data));
        if (!data?.success || !data?.data) continue;
        const sourceData = data.data;
        if (!writersBySource[source]) writersBySource[source] = new Set<string>();
        if (!producersBySource[source]) producersBySource[source] = new Set<string>();

        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];

        // Per-role Spotify authority (only when source key is the real spotify and roles are non-empty)
        if (source === 'spotify') {
          if (sourceWriters.length > 0) {
            spotifyWritersAuthoritative = true;
            console.log('Spotify WRITERS authoritative (source:', sourceData.creditsSource, ')');
          }
          if (sourceProducers.length > 0) {
            spotifyProducersAuthoritative = true;
            console.log('Spotify PRODUCERS authoritative (source:', sourceData.creditsSource, ')');
          }
        }

        // Capture Spotify artist IDs from the wrapper response (regardless of internal fallback)
        if (Array.isArray(_spotifyArtistIds)) {
          for (const a of _spotifyArtistIds) {
            if (a.name && a.id) {
              spotifyArtistIds[a.name.toLowerCase()] = a.id;
            }
          }
          console.log('Captured Spotify artist IDs (Odesli path):', JSON.stringify(_spotifyArtistIds));
        }

        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name) writersBySource[source].add(name.toLowerCase().trim());
        }
        for (const p of sourceProducers) {
          const name = typeof p === 'string' ? p : p?.name;
          if (name) producersBySource[source].add(name.toLowerCase().trim());
        }

        if (source === 'genius' || source === 'apple') {
          if (!fallbackAlbum && typeof sourceData.album === 'string' && sourceData.album.trim()) {
            fallbackAlbum = sourceData.album.trim();
          }
          if (!fallbackReleaseDate && typeof sourceData.releaseDate === 'string' && sourceData.releaseDate.trim()) {
            fallbackReleaseDate = sourceData.releaseDate.trim();
          }
        }
        if (source === 'apple' && sourceData) {
          if (sourceData.exclusiveLicensee) {
            if (!fallbackRecordLabel) fallbackRecordLabel = sourceData.exclusiveLicensee;
            console.log('Apple exclusive licensee:', sourceData.exclusiveLicensee);
          }
          if (sourceData.copyrightLabel && !fallbackRecordLabel) {
            fallbackRecordLabel = sourceData.copyrightLabel;
            console.log('Apple copyright label:', sourceData.copyrightLabel);
          }
        }
      }

      console.log('Spotify authoritative — writers:', spotifyWritersAuthoritative, 'producers:', spotifyProducersAuthoritative,
                  '| Responding sources:', [...new Set([...Object.keys(writersBySource), ...Object.keys(producersBySource)])]);

      // Merge Spotify Web API track-level artists into artistNames.
      // These come from Spotify's authoritative track endpoint (not AI), so they
      // satisfy fail-closed policy and ensure all credited performers (e.g. features
      // not present in the original Odesli artist string) are surfaced as artists.
      for (const lcName of Object.keys(spotifyArtistIds)) {
        if (!lcName) continue;
        const already = artistNames.some((n: string) => n.toLowerCase().trim() === lcName);
        if (!already) {
          // Recover original casing from any captured artistIds payload (best-effort)
          let display = lcName.replace(/\b\w/g, (c) => c.toUpperCase());
          for (const { _spotifyArtistIds } of normalizedEnrich) {
            if (Array.isArray(_spotifyArtistIds)) {
              const hit = _spotifyArtistIds.find((a: any) => a?.name?.toLowerCase() === lcName);
              if (hit?.name) { display = hit.name; break; }
            }
          }
          artistNames.push(display);
          console.log('Added Spotify Web API artist to artistNames:', display);
        }
      }

      // Per-role authority: when Spotify confirms a role, only Spotify-confirmed names pass for that role.
      // Otherwise require corroboration (trusted source OR 2+ sources). AI alone is NEVER enough.
      const isCorroborated = (name: string, role: 'writer' | 'producer', bySourceMap: Record<string, Set<string>>): boolean => {
        const nameLower = name.toLowerCase().trim();
        const spotifyAuth = role === 'writer' ? spotifyWritersAuthoritative : spotifyProducersAuthoritative;
        if (spotifyAuth) {
          return bySourceMap['spotify']?.has(nameLower) || false;
        }
        let sourceCount = 0;
        let inTrusted = false;
        let onlyAi = true;
        for (const [src, names] of Object.entries(bySourceMap)) {
          if (names.has(nameLower)) {
            sourceCount++;
            if (src !== 'ai') onlyAi = false;
            if (src === 'genius' || src === 'spotify' || src === 'apple') inTrusted = true;
          }
        }
        if (onlyAi) return false; // never accept AI-only credits
        const allSources = new Set([...Object.keys(writersBySource), ...Object.keys(producersBySource)]);
        const nonAiSources = [...allSources].filter(s => s !== 'ai');
        const lowCoverage = nonAiSources.length <= 2;
        if (lowCoverage) return sourceCount >= 1;
        return inTrusted || sourceCount >= 2;
      };

      for (const { source, data } of normalizedEnrich) {
        if (!data?.success || !data?.data) continue;
        const sourceData = data.data;
        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];

        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name && isCorroborated(name, 'writer', writersBySource) &&
              !geniusWriters.find(x => x.name.toLowerCase() === name.toLowerCase())) {
            geniusWriters.push({ name, role: 'writer' });
          }
        }
        for (const p of sourceProducers) {
          const name = typeof p === 'string' ? p : p?.name;
          if (name && isCorroborated(name, 'producer', producersBySource) &&
              !geniusProducers.find(x => x.name.toLowerCase() === name.toLowerCase())) {
            geniusProducers.push({ name, role: 'producer' });
          }
        }
      }

      console.log('Final writers after enrichment:', geniusWriters);
      console.log('Final producers after enrichment:', geniusProducers);

      const allNames = [...artistNames, ...geniusWriters.map(w => w.name), ...geniusProducers.map(p => p.name)];
      const uniqueNames = [...new Set(allNames)];

      let proData: any = { success: true, data: {}, searched: [] };
      if (uniqueNames.length > 0 && !skipPro) {
        try {
          const proResponse = await fetch(`${supabaseUrl}/functions/v1/pro-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ names: uniqueNames, songTitle: extractedInfo.title, artist: artistNames[0], filterPros }),
          });
          proData = await proResponse.json();
        } catch (e) { console.log('PRO lookup failed:', e); }
      }

      // Collect social links from Genius enrichment (Odesli path)
      const odesliSocialMap: Record<string, Record<string, string>> = {};
      for (const { source, data } of enrichResults) {
        if (source === 'genius' && data?.success && data?.data?.artistSocialLinks) {
          for (const [name, links] of Object.entries(data.data.artistSocialLinks as Record<string, Record<string, string>>)) {
            const key = name.toLowerCase();
            odesliSocialMap[key] = { ...(odesliSocialMap[key] || {}), ...links };
          }
        }
      }

      // Helper: determine signing status from all available signals (Odesli path)
      const resolveSigningStatusOdesli = (proInfo: any, role: string, inheritedLabel?: string | null): {
        publishingStatus: 'signed' | 'unsigned' | 'unknown';
        recordLabel?: string;
      } => {
        const effectiveLabel = proInfo?.recordLabel || inheritedLabel || null;
        const hasPublisher = !!proInfo?.publisher;
        const hasLabel = !!effectiveLabel;

        let publishingStatus: 'signed' | 'unsigned' | 'unknown' = 'unknown';
        if (hasPublisher) {
          publishingStatus = 'signed';
        } else if (role === 'artist' && hasLabel) {
          publishingStatus = 'signed';
        }
        // PRO/IPI alone = "unknown" (registered ≠ signed to a publisher)

        return { publishingStatus, recordLabel: effectiveLabel || undefined };
      };

      console.log('Odesli path: song-level record label for credit propagation:', fallbackRecordLabel);

      // Resolve Spotify artist IDs for writers/producers that don't have one yet
      const allCreditNames = [...artistNames, ...geniusWriters.map(w => w.name), ...geniusProducers.map(p => p.name)];
      spotifyArtistIds = await batchResolveSpotifyArtistIds(allCreditNames, spotifyArtistIds);

      const allCredits: any[] = [];
      for (const artistName of artistNames) {
        const proInfo = proData.data?.[artistName];
        const social = odesliSocialMap[artistName.toLowerCase()];
        const { publishingStatus, recordLabel: resolvedLabel } = resolveSigningStatusOdesli(proInfo, 'artist', fallbackRecordLabel);
        allCredits.push({
          name: artistName, role: 'artist' as const,
          publishingStatus,
          publisher: proInfo?.publisher, recordLabel: resolvedLabel, management: proInfo?.management,
          ipi: proInfo?.ipi, pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry, locationName: proInfo?.locationName,
          socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
          spotifyArtistId: spotifyArtistIds[artistName.toLowerCase()] || undefined,
          appleArtistId: appleArtistIds[artistName.toLowerCase()] || undefined,
        });
      }
      for (const writer of geniusWriters) {
        const proInfo = proData.data?.[writer.name];
        const social = odesliSocialMap[writer.name.toLowerCase()];
        const { publishingStatus } = resolveSigningStatusOdesli(proInfo, 'writer');
        allCredits.push({
          name: writer.name, role: 'writer' as const,
          publishingStatus,
          publisher: proInfo?.publisher, recordLabel: proInfo?.recordLabel, management: proInfo?.management,
          ipi: proInfo?.ipi, pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry, locationName: proInfo?.locationName,
          socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
          spotifyArtistId: spotifyArtistIds[writer.name.toLowerCase()] || undefined,
          appleArtistId: appleArtistIds[writer.name.toLowerCase()] || undefined,
        });
      }
      for (const producer of geniusProducers) {
        if (allCredits.some(c => c.name.toLowerCase() === producer.name.toLowerCase() && c.role === 'producer')) continue;
        const proInfo = proData.data?.[producer.name];
        const social = odesliSocialMap[producer.name.toLowerCase()];
        const { publishingStatus } = resolveSigningStatusOdesli(proInfo, 'producer');
        allCredits.push({
          name: producer.name, role: 'producer' as const,
          publishingStatus,
          publisher: proInfo?.publisher, recordLabel: proInfo?.recordLabel, management: proInfo?.management,
          ipi: proInfo?.ipi, pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry, locationName: proInfo?.locationName,
          socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
          spotifyArtistId: spotifyArtistIds[producer.name.toLowerCase()] || undefined,
          appleArtistId: appleArtistIds[producer.name.toLowerCase()] || undefined,
        });
      }

      const result = {
        success: true,
        data: {
          song: { title: extractedInfo.title, artist: extractedInfo.artist, album: fallbackAlbum, releaseDate: fallbackReleaseDate, coverUrl, mbid: null, recordLabel: fallbackRecordLabel, isrc: extractedInfo?.isrc || null },
          credits: allCredits,
          sources: proData.searched || ['Genius', 'Streaming Service'],
          dataSource: 'odesli' as const,
          creditNames: skipPro ? uniqueNames : undefined,
        },
      };

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== MB NOT FOUND ==========
    if (!mbData?.success || !mbData?.data) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not find song information. Try searching with "Artist - Song Title"' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== MB SUCCESS PATH ==========
    const songData = mbData.data;

    let appleMusicUrl: string | null = null;
    if (typeof query === 'string' && query.startsWith('http') && odesliCrossLinkPromise) {
      try {
        const odesliResult = await odesliCrossLinkPromise;
        appleMusicUrl = odesliResult?.appleMusicUrl || null;
        if (!spotifyTrackId && odesliResult?.spotifyTrackId) {
          spotifyTrackId = odesliResult.spotifyTrackId;
        }
        console.log('Odesli cross-links: Apple=', appleMusicUrl, 'Spotify=', spotifyTrackId);
      } catch (e) { console.log('Odesli cross-link fetch failed:', e); }
    }

    // If still no Spotify track ID, search Spotify
    if (!spotifyTrackId && songData.title && songData.artists?.[0]?.name) {
      const spotResult = await searchSpotifyTrack(songData.title, songData.artists[0].name);
      if (spotResult?.trackId) {
        spotifyTrackId = spotResult.trackId;
        console.log('Found Spotify track ID via search:', spotifyTrackId);
      }
      if (spotResult?.artistIds) spotifyArtistIds = { ...spotifyArtistIds, ...spotResult.artistIds };
    }

    // Enrich record label from Spotify API (most accurate source for label info)
    if (spotifyTrackId && !songData.recordLabel) {
      try {
        const spotTrack = await getSpotifyTrackById(spotifyTrackId);
        if (spotTrack?.albumLabel) {
          songData.spotifyLabel = spotTrack.albumLabel;
          console.log('Got record label from Spotify/Pathfinder (MB path):', spotTrack.albumLabel);
        }
        if (!songData.album && spotTrack?.albumName) {
          songData.album = spotTrack.albumName;
        }
        if (!songData.releaseDate && spotTrack?.releaseDate) {
          songData.releaseDate = spotTrack.releaseDate;
          console.log('Got release date from Spotify (MB path):', spotTrack.releaseDate);
        }
        if (spotTrack?.artistIds) spotifyArtistIds = { ...spotifyArtistIds, ...spotTrack.artistIds };
      } catch (e) { console.log('Spotify label enrichment failed:', e); }
    }

    // Deezer label fallback if Spotify didn't return a label (MB path)
    if (!songData.recordLabel && !songData.spotifyLabel && songData.title && songData.artists?.[0]?.name) {
      const deezerLabel = await getDeezerRecordLabel(songData.title, songData.artists[0].name);
      if (deezerLabel) {
        songData.spotifyLabel = deezerLabel;
        console.log('Got record label from Deezer fallback (MB path):', deezerLabel);
      }
    }

    let producers: any[] = Array.isArray(songData.producers) ? songData.producers : [];
    let additionalWriters: any[] = [];
    const mbWriters: any[] = Array.isArray(songData.writers) ? songData.writers : [];

    // Always enrich from all sources
    console.log('Fetching enrichment sources in parallel...');

    const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

    // Determine artist name for enrichment lookups.
    // If MusicBrainz returned a non-Latin artist name (e.g. Arabic, Hindi, Korean),
    // also try the original Latin-script artist name from the user query for Genius/Discogs.
    const mbArtistName = songData.artists?.[0]?.name || '';
    const hasNonLatin = /[^\u0000-\u007F]/.test(mbArtistName);
    let queryArtistName: string | null = null;
    if (hasNonLatin) {
      // Extract original artist from query (e.g. "Amr Diab - Tamally Maak" → "Amr Diab")
      const qParts = searchQuery.split(/\s*[-–—]\s*/);
      if (qParts.length >= 2) {
        queryArtistName = qParts[0].trim();
      } else if (extractedInfo?.artist && !/[^\u0000-\u007F]/.test(extractedInfo.artist)) {
        queryArtistName = extractedInfo.artist;
      }
      console.log('Non-Latin MB artist detected. MB:', mbArtistName, 'Query fallback:', queryArtistName);
    }
    const enrichmentArtist = queryArtistName || mbArtistName;

    // Also simplify the title for enrichment: strip parentheticals like "(Always With You)"
    // which can cause search failures on Genius/Discogs
    let enrichmentTitle = songData.title || '';
    const strippedTitle = enrichmentTitle.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (strippedTitle.length >= 3) {
      enrichmentTitle = strippedTitle;
      console.log('Simplified enrichment title:', enrichmentTitle);
    }

    const enrichmentPromises: Promise<{ source: string; data: any }>[] = [];

    // Genius - try with best available artist name and simplified title
    enrichmentPromises.push(
      fetch(`${supabaseUrl}/functions/v1/genius-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ title: enrichmentTitle, artist: enrichmentArtist }),
      }).then(r => r.json()).then(data => ({ source: 'genius', data }))
        .catch(e => { console.log('Genius failed:', e); return { source: 'genius', data: null }; })
    );

    // Discogs - try with best available artist name
    enrichmentPromises.push(
      fetch(`${supabaseUrl}/functions/v1/discogs-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ title: enrichmentTitle, artist: enrichmentArtist }),
      }).then(r => r.json()).then(data => ({ source: 'discogs', data }))
        .catch(e => { console.log('Discogs failed:', e); return { source: 'discogs', data: null }; })
    );

    // Apple Music credits
    if (appleMusicUrl) {
      enrichmentPromises.push(
        withTimeout(
          fetch(`${supabaseUrl}/functions/v1/apple-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ url: appleMusicUrl }),
          }).then(r => r.json()).then(data => ({ source: 'apple', data }))
            .catch(e => { console.log('Apple failed:', e); return { source: 'apple', data: null }; }),
          15000, { source: 'apple', data: null }
        )
      );
    }

    // Spotify credits - ALWAYS try if we have a track ID
    if (spotifyTrackId) {
      enrichmentPromises.push(
        withTimeout(
          fetch(`${supabaseUrl}/functions/v1/spotify-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ trackId: spotifyTrackId, songTitle: enrichmentTitle, artist: enrichmentArtist }),
          }).then(r => r.json()).then(data => ({ source: 'spotify', data }))
            .catch(e => { console.log('Spotify failed:', e); return { source: 'spotify', data: null }; }),
          15000, { source: 'spotify', data: null }
        )
      );
    }

    const enrichmentResults = await Promise.all(enrichmentPromises);
    console.log('Parallel enrichment completed:', enrichmentResults.map(r => r.source));

    // Engineer filter
    const knownEngineers = new Set([
      'serban ghenea', 'manny marroquin', 'dave pensado', 'tony maserati',
      'john hanes', 'josh gudwin', 'neal pogue', 'randy merrill',
      'sam holland', 'cory bice', 'shin kamiyama', 'dave kutch',
      'chris gehringer', 'joe laporta', 'emily lazar', 'dale becker',
      'tom coyne', 'chris athens', 'mike bozzi', 'bob ludwig',
      'bernie grundman', 'brian "big bass" gardner', 'sarah park',
      'saskia whinney', 'john greenham', 'jeremie inhaber',
    ]);
    const isLikelyEngineer = (name: string): boolean => knownEngineers.has(name.toLowerCase().trim());

    // ========== SPOTIFY-FIRST CREDIT FILTERING (MB path) ==========
    // Per-role Spotify authority. The wrapper `spotify-credits-lookup` may fall back
    // internally to genius/deezer/AI; reclassify those under their true source so an
    // AI hallucination cannot pose as a Spotify-confirmed credit.
    const writersBySource: Record<string, Set<string>> = {};
    const producersBySource: Record<string, Set<string>> = {};
    let spotifyWritersAuthoritative = false;
    let spotifyProducersAuthoritative = false;

    const normalizedEnrichmentResults = enrichmentResults.map((r) => {
      const { source, data } = r;
      if (source === 'spotify' && data?.success && data?.data?.creditsSource) {
        const cs = data.data.creditsSource;
        if (cs !== 'spotify-internal' && cs !== 'spotify-pathfinder' && cs !== 'spotify-scrape' && cs !== 'spotify-webapi') {
          const reclassified = cs === 'genius' ? 'genius' : cs === 'deezer' ? 'deezer' : 'ai';
          return { source: reclassified, data, _spotifyArtistIds: data.artistIds };
        }
      }
      return { source, data, _spotifyArtistIds: source === 'spotify' ? data?.artistIds : undefined };
    });

    for (const result of normalizedEnrichmentResults) {
      const { source, data, _spotifyArtistIds } = result;
      console.log(`${source} lookup response:`, JSON.stringify(data));
      if (!data?.success || !data?.data) continue;

      const sourceData = data.data;
      if (!writersBySource[source]) writersBySource[source] = new Set<string>();
      if (!producersBySource[source]) producersBySource[source] = new Set<string>();

      const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
      const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];

      // Per-role Spotify authority
      if (source === 'spotify') {
        if (sourceWriters.length > 0) {
          spotifyWritersAuthoritative = true;
          console.log('Spotify WRITERS authoritative (source:', sourceData.creditsSource, ')');
        }
        if (sourceProducers.length > 0) {
          spotifyProducersAuthoritative = true;
          console.log('Spotify PRODUCERS authoritative (source:', sourceData.creditsSource, ')');
        }
      }

      // Capture Spotify artist IDs from the wrapper response (regardless of internal fallback)
      if (Array.isArray(_spotifyArtistIds)) {
        for (const a of _spotifyArtistIds) {
          if (a.name && a.id) {
            spotifyArtistIds[a.name.toLowerCase()] = a.id;
          }
        }
        console.log('Captured Spotify artist IDs (MB path):', JSON.stringify(_spotifyArtistIds));
      }

      for (const p of sourceProducers) {
        const name = typeof p === 'string' ? p : p?.name;
        if (name && !isLikelyEngineer(name)) {
          producersBySource[source].add(name.toLowerCase().trim());
        }
      }

      for (const w of sourceWriters) {
        const name = typeof w === 'string' ? w : w?.name;
        if (name) {
          writersBySource[source].add(name.toLowerCase().trim());
        }
      }

      if (source === 'apple') {
        if (!songData.album && typeof sourceData.album === 'string') songData.album = sourceData.album;
        if (!songData.releaseDate && typeof sourceData.releaseDate === 'string') songData.releaseDate = sourceData.releaseDate;
        if (sourceData.exclusiveLicensee) {
          songData.exclusiveLicensee = sourceData.exclusiveLicensee;
          console.log('Apple exclusive licensee (MB path):', sourceData.exclusiveLicensee);
        }
        if (sourceData.copyrightLabel && !songData.copyrightLabel) {
          songData.copyrightLabel = sourceData.copyrightLabel;
          console.log('Apple copyright label (MB path):', sourceData.copyrightLabel);
        }
      }
    }

    console.log('Spotify authoritative (MB path) — writers:', spotifyWritersAuthoritative, 'producers:', spotifyProducersAuthoritative,
                '| Responding sources:', [...new Set([...Object.keys(writersBySource), ...Object.keys(producersBySource)])]);

    const isCorroborated = (name: string, role: 'writer' | 'producer', bySourceMap: Record<string, Set<string>>): boolean => {
      const nameLower = name.toLowerCase().trim();
      const spotifyAuth = role === 'writer' ? spotifyWritersAuthoritative : spotifyProducersAuthoritative;
      if (spotifyAuth) {
        return bySourceMap['spotify']?.has(nameLower) || false;
      }
      let sourceCount = 0;
      let inTrusted = false;
      let onlyAi = true;
      for (const [src, names] of Object.entries(bySourceMap)) {
        if (names.has(nameLower)) {
          sourceCount++;
          if (src !== 'ai') onlyAi = false;
          if (src === 'genius' || src === 'spotify' || src === 'apple') inTrusted = true;
        }
      }
      if (onlyAi) return false; // never accept AI-only credits
      const allSources = new Set([...Object.keys(writersBySource), ...Object.keys(producersBySource)]);
      const nonAiSources = [...allSources].filter(s => s !== 'ai');
      const lowCoverage = nonAiSources.length <= 2;
      if (lowCoverage) return sourceCount >= 1;
      return inTrusted || sourceCount >= 2;
    };

    // Now add only corroborated credits
    for (const result of normalizedEnrichmentResults) {
      const { source, data } = result;
      if (!data?.success || !data?.data) continue;
      const sourceData = data.data;

      const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
      for (const p of sourceProducers) {
        const name = typeof p === 'string' ? p : p?.name;
        if (name && !isLikelyEngineer(name) && isCorroborated(name, 'producer', producersBySource) &&
            !producers.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())) {
          producers.push(typeof p === 'string' ? { name: p, role: 'producer' } : p);
          console.log(`${source} added producer (corroborated):`, name);
        }
      }

      const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
      for (const w of sourceWriters) {
        const name = typeof w === 'string' ? w : w?.name;
        if (name && isCorroborated(name, 'writer', writersBySource) &&
            !additionalWriters.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())) {
          additionalWriters.push(typeof w === 'string' ? { name: w, role: 'writer' } : w);
          console.log(`${source} added writer (corroborated):`, name);
        }
      }
    }

    console.log('Consensus filtering complete. Sources available:', Object.keys(writersBySource));

    // Name normalization
    const normalizeName = (name: string): string => {
      return String(name || '').trim()
        .replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '')
        .replace(/[''"""\u201C\u201D\u2018\u2019]/g, '') // strip embedded quotes/nicknames
        .replace(/\s*&\s*/g, ' and ').replace(/\s*,\s+/g, ', ')
        .replace(/^(?:feat\.?|ft\.?|featuring)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Name variant map for common abbreviations
    const NAME_VARIANTS: Record<string, string> = {
      matt: 'matthew', matty: 'matthew', mike: 'michael', mikey: 'michael',
      rob: 'robert', robbie: 'robert', bob: 'robert', bobby: 'robert',
      will: 'william', bill: 'william', billy: 'william',
      jim: 'james', jimmy: 'james', jamie: 'james',
      dave: 'david', danny: 'daniel', dan: 'daniel',
      chris: 'christopher', tony: 'anthony', joe: 'joseph', joey: 'joseph',
      tom: 'thomas', tommy: 'thomas', nick: 'nicholas', nicky: 'nicholas',
      ben: 'benjamin', benny: 'benjamin', ed: 'edward', eddie: 'edward',
      sam: 'samuel', sammy: 'samuel', steve: 'stephen', stevie: 'stephen',
      alex: 'alexander', fred: 'frederick', freddie: 'frederick',
      charlie: 'charles', chuck: 'charles', dick: 'richard', rick: 'richard',
      pat: 'patrick', andy: 'andrew', drew: 'andrew',
      greg: 'gregory', larry: 'lawrence', ray: 'raymond',
      ted: 'theodore', theo: 'theodore', pete: 'peter', jon: 'jonathan',
      kate: 'katherine', katie: 'katherine', liz: 'elizabeth', beth: 'elizabeth',
      jen: 'jennifer', jenny: 'jennifer', meg: 'margaret',
      sue: 'susan', becky: 'rebecca',
    };

    // Known stage-name / alias mappings (alias → canonical full name)
    const KNOWN_ALIASES: Record<string, string> = {
      'koz': 'stephen kozmeniuk',
      'boi-1da': 'matthew samuels',
      'hit-boy': 'chauncey hollis',
      'detail': 'noel fisher',
      'starrah': 'brittany hazzard',
      'the-dream': 'terius nash',
      'tricky stewart': 'christopher stewart',
      'darkchild': 'rodney jerkins',
      'timbaland': 'timothy mosley',
      'pharrell': 'pharrell williams',
      'swizz beatz': 'kasseem dean',
      'swiss beatz': 'kasseem dean',
      'mike dean': 'michael dean',
      'mike will made-it': 'michael williams',
      'mike will made it': 'michael williams',
      'dr. luke': 'lukasz gottwald',
      'dr luke': 'lukasz gottwald',
      'benny blanco': 'benjamin levin',
      'diplo': 'thomas pentz',
      'marshmello': 'christopher comstock',
      'skrillex': 'sonny moore',
      'zedd': 'anton zaslavski',
      'finneas': 'finneas oconnell',
      'ludwig goransson': 'ludwig göransson',
      'take a daytrip': 'denzel baptiste',
      'tay keith': 'brytavious loren chambers',
      'ojivolta': 'monte booker',
      'bnyx': 'bnyx',
      'frank dukes': 'adam feeney',
      'wondagurl': 'ebony oshunrinde',
      'sevn thomas': 'sevn thomas',
      'metroboomin': 'leland wayne',
      'metro boomin': 'leland wayne',
      'murda beatz': 'shane lindstrom',
      'wheezy': 'joseph obi',
      'tm88': 'bryan simmons',
      'southside': 'joshua luellen',
      'london on da track': 'london holmes',
      'cirkut': 'henry walter',
      'cashmere cat': 'magnus høgberg',
      'arca': 'alejandra ghersi',
      'sophie': 'sophie xeon',
      'bloodpop': 'michael tucker',
      'ilya': 'ilya salmanzadeh',
      'shellback': 'karl johan schuster',
      'rami yacoub': 'rami yacoub',
      'oak felder': 'oak felder',
      'no i.d.': 'ernest wilson',
      'no id': 'ernest wilson',
      // === LATIN ===
      'tainy': 'marcos efrain masís',
      'sky rompiendo': 'sky rompiendo',
      'ovy on the drums': 'daniel oviedo',
      'mag': 'miguel andrés guerra',
      'subelo neo': 'jean rodriguez',
      'dímelo flow': 'dímelo flow',
      'el guincho': 'pablo díaz-reixa',
      'bizarrap': 'gonzalo conde',
      'lex borrero': 'alexis borrero',
      'elena rose': 'elena rose',
      'los legendarios': 'los legendarios',
      'caleb calloway': 'caleb calloway',
      'albert hype': 'albert hype',
      'luny tunes': 'francisco saldaña',
      'luny': 'francisco saldaña',
      'nely el arma secreta': 'manuel cabrera',
      'mr naisgai': 'mr naisgai',
      'kevyn cruz': 'kevyn cruz',
      'chris jeday': 'jesús nieves',
      'gaby music': 'gabriel rodriguez',
      // === K-POP ===
      'teddy park': 'park hongjun',
      'teddy': 'park hongjun',
      'choice37': 'jung euiseok',
      'el capitxn': 'el capitxn',
      'bumzu': 'min kyunghoon',
      'pdogg': 'kang hyowon',
      'slow rabbit': 'kwon dohyun',
      'supreme boi': 'shin donghyuk',
      'adora': 'kim ara',
      'ghstloop': 'ghstloop',
      'danke': 'danke',
      'ldk': 'ldk',
      'ryan jhun': 'ryan jhun',
      'dem jointz': 'demetrius shipp',
      'kenzie': 'kim yeonjeong',
      'yoo youngjin': 'yoo youngjin',
      'jype': 'park jinyoung',
      'jyp': 'park jinyoung',
      'black eyed pilseung': 'rado',
      'earattack': 'earattack',
      '250': 'song euigwan',
      // === AFROBEATS ===
      'sarz': 'osabuohien osaretin',
      'p2j': 'michael uzowuru',
      'p.priime': 'ifeoluwa odunsi',
      'london': 'london',
      'pheelz': 'phillip moses',
      'magicsticks': 'uchenna onuoha',
      'spax': 'david ademola',
      'rexxie': 'ezeh chisom',
      'killertunes': 'oladapo olatunde',
      'blaise beatz': 'blaise beatz',
      'tempoe': 'yinka adeyemo',
      'young jonn': 'john udomboso',
      'legendury beatz': 'uzoechi emeka',
      'fresh vdm': 'fresh vdm',
      'niphkeys': 'onifade olawale',
      'kiddominant': 'abiona oluwatobi',
      'del b': 'oladele peter',
      'masterkraft': 'sunday ginikachukwu nweke',
      'gospel on debeatz': 'gospel obi',
      'telz': 'oluwatobi ajayi',
      'kulboy': 'kulboy',
      'shizzi': 'olumuyiwa awoniyi',
    };

    // Create a canonical key for fuzzy dedup
    const canonicalKey = (name: string): string => {
      const normalized = normalizeName(name).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      // Check alias map first (exact match on normalized name)
      if (KNOWN_ALIASES[normalized]) {
        return KNOWN_ALIASES[normalized];
      }
      const parts = normalized.split(' ');
      if (parts.length >= 2 && NAME_VARIANTS[parts[0]]) {
        parts[0] = NAME_VARIANTS[parts[0]];
      }
      return parts.join(' ');
    };

    // Enhanced dedup: merge writers with matching canonical keys
    const allWriters: any[] = [...mbWriters];
    for (const extraWriter of additionalWriters) {
      const normalizedName = normalizeName(extraWriter.name);
      const extraKey = canonicalKey(extraWriter.name);
      const existingIdx = allWriters.findIndex((w: any) => canonicalKey(w.name) === extraKey);
      if (existingIdx < 0) {
        allWriters.push({ ...extraWriter, name: normalizedName || extraWriter.name });
      } else {
        // Keep the longer/more complete name
        if (normalizedName.length > normalizeName(allWriters[existingIdx].name).length) {
          allWriters[existingIdx] = { ...allWriters[existingIdx], ...extraWriter, name: normalizedName };
        }
      }
    }

    // Build reverse alias map: canonical → longest known stage name
    const REVERSE_ALIAS: Record<string, string> = {};
    for (const [alias, canonical] of Object.entries(KNOWN_ALIASES)) {
      if (!REVERSE_ALIAS[canonical] || alias.length > REVERSE_ALIAS[canonical].length) {
        REVERSE_ALIAS[canonical] = alias;
      }
    }

    // Cross-reference writers and producers: if same canonical key, use longer name
    const writerNamesByKey = new Map<string, string>();
    for (const w of allWriters) {
      const key = canonicalKey(w.name);
      const existing = writerNamesByKey.get(key);
      if (!existing || w.name.length > existing.length) {
        writerNamesByKey.set(key, normalizeName(w.name) || w.name);
      }
    }

    // Deduplicate producers by canonical key
    const dedupedProducers: any[] = [];
    const seenProducerKeys = new Set<string>();
    for (const p of producers) {
      const key = canonicalKey(p.name);
      if (!seenProducerKeys.has(key)) {
        seenProducerKeys.add(key);
        // Prefer the writer's name if it's longer (e.g., "Teddy Park" over "TEDDY")
        const writerName = writerNamesByKey.get(key);
        const producerName = normalizeName(p.name) || p.name;
        const bestName = writerName && writerName.length > producerName.length ? writerName : producerName;
        dedupedProducers.push({ ...p, name: bestName });
      }
    }
    producers = dedupedProducers;

    if (Object.keys(spotifyArtistIds).length > 0) {
      console.log('Spotify artist IDs captured:', JSON.stringify(spotifyArtistIds));
    }

    // Resolve Spotify artist IDs for writers/producers that don't have one yet
    const allCreditNamesMB = [
      ...songData.artists.map((a: any) => a.name),
      ...allWriters.map((w: any) => w.name),
      ...producers.map((p: any) => p.name),
    ];
    spotifyArtistIds = await batchResolveSpotifyArtistIds(allCreditNamesMB, spotifyArtistIds);

    // Fetch Apple Music artist IDs via iTunes Search API
    if (songData.title && songData.artists?.[0]?.name) {
      try {
        const itunesQ = `${songData.artists[0].name} ${songData.title}`;
        const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesQ)}&entity=song&limit=5`;
        const itunesResp = await fetch(itunesSearchUrl);
        if (itunesResp.ok) {
          const itunesData = await itunesResp.json();
          for (const result of (itunesData?.results || [])) {
            if (result?.artistName && result?.artistId) {
              const key = result.artistName.toLowerCase();
              if (!appleArtistIds[key]) {
                appleArtistIds[key] = String(result.artistId);
              }
            }
          }
          if (Object.keys(appleArtistIds).length > 0) {
            console.log('Apple Music artist IDs captured:', JSON.stringify(appleArtistIds));
          }
        }
      } catch (e) { console.log('iTunes artist ID lookup failed:', e); }
    }

    const allNames = [
      ...songData.artists.map((a: any) => a.name),
      ...allWriters.map((w: any) => w.name),
      ...producers.map((p: any) => p.name),
    ];
    const uniqueNames = [...new Set(allNames)];

    console.log('Artists:', songData.artists.map((a: any) => a.name));
    console.log('Writers:', allWriters.map((w: any) => w.name));
    console.log('Producers:', producers.map((p: any) => p.name));

    // Step 2: PRO lookup
    let proData: any = { success: true, data: {}, searched: [] };
    if (uniqueNames.length > 0 && !skipPro) {
      const proResponse = await fetch(`${supabaseUrl}/functions/v1/pro-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ names: uniqueNames, songTitle: songData.title, artist: songData.artists[0]?.name, filterPros }),
      });
      proData = await proResponse.json();
    }

    // Combine results
    // Build socialLinks map from MusicBrainz artists + Genius enrichment
    const socialLinksMap: Record<string, Record<string, string>> = {};
    for (const artist of songData.artists) {
      if (artist.socialLinks) {
        socialLinksMap[artist.name.toLowerCase()] = { ...(socialLinksMap[artist.name.toLowerCase()] || {}), ...artist.socialLinks };
      }
    }
    // Merge Genius social links
    for (const result of enrichmentResults) {
      if (result.source === 'genius' && result.data?.success && result.data?.data?.artistSocialLinks) {
        for (const [name, links] of Object.entries(result.data.data.artistSocialLinks as Record<string, Record<string, string>>)) {
          const key = name.toLowerCase();
          socialLinksMap[key] = { ...(socialLinksMap[key] || {}), ...links };
        }
      }
    }
    if (Object.keys(socialLinksMap).length > 0) {
      console.log('Merged social links map:', socialLinksMap);
    }

    // Resolve the song-level record label from best available source
    const songRecordLabel = songData.exclusiveLicensee || songData.spotifyLabel || songData.recordLabel || songData.copyrightLabel || null;
    console.log('Song-level record label for credit propagation:', songRecordLabel);

    // Helper: determine signing status from all available signals
    const resolveSigningStatus = (proInfo: any, role: string, inheritedLabel?: string | null): {
      publishingStatus: 'signed' | 'unsigned' | 'unknown';
      recordLabel?: string;
    } => {
      const effectiveLabel = proInfo?.recordLabel || inheritedLabel || null;
      const hasPublisher = !!proInfo?.publisher;
      const hasLabel = !!effectiveLabel;

      let publishingStatus: 'signed' | 'unsigned' | 'unknown' = 'unknown';
      if (hasPublisher) {
        publishingStatus = 'signed';
      } else if (role === 'artist' && hasLabel) {
        // Artists on a known record label are signed (label deal implies professional representation)
        publishingStatus = 'signed';
      }
      // PRO/IPI alone = "unknown" (registered with a PRO ≠ signed to a publisher)

      return { publishingStatus, recordLabel: effectiveLabel || undefined };
    };

    const credits = [];

    for (const artist of songData.artists) {
      const proInfo = proData.data?.[artist.name];
      const social = socialLinksMap[artist.name.toLowerCase()];
      // Artists inherit the song-level record label if PRO lookup didn't find one
      const { publishingStatus, recordLabel: resolvedLabel } = resolveSigningStatus(proInfo, 'artist', songRecordLabel);
      credits.push({
        name: artist.name, role: 'artist',
        publishingStatus,
        publisher: proInfo?.publisher, recordLabel: resolvedLabel, management: proInfo?.management,
        ipi: proInfo?.ipi, pro: proInfo?.pro,
        locationCountry: artist.country || proInfo?.locationCountry,
        locationName: artist.area || proInfo?.locationName,
        socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
        spotifyArtistId: spotifyArtistIds[artist.name.toLowerCase()] || undefined,
        appleArtistId: appleArtistIds[artist.name.toLowerCase()] || undefined,
      });
    }

    for (const writer of allWriters) {
      const proInfo = proData.data?.[writer.name];
      if (!credits.find(c => c.name === writer.name && c.role === 'artist')) {
        const social = socialLinksMap[writer.name.toLowerCase()];
        const { publishingStatus } = resolveSigningStatus(proInfo, 'writer');
        credits.push({
          name: writer.name, role: 'writer',
          publishingStatus,
          publisher: proInfo?.publisher, recordLabel: proInfo?.recordLabel, management: proInfo?.management,
          ipi: proInfo?.ipi, pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry, locationName: proInfo?.locationName,
          socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
          spotifyArtistId: spotifyArtistIds[writer.name.toLowerCase()] || undefined,
          appleArtistId: appleArtistIds[writer.name.toLowerCase()] || undefined,
        });
      }
    }

    for (const producer of producers) {
      const proInfo = proData.data?.[producer.name];
      if (!credits.find(c => c.name === producer.name && c.role === 'producer')) {
        const social = socialLinksMap[producer.name.toLowerCase()];
        const { publishingStatus } = resolveSigningStatus(proInfo, 'producer');
        credits.push({
          name: producer.name, role: 'producer',
          publishingStatus,
          publisher: proInfo?.publisher, recordLabel: proInfo?.recordLabel, management: proInfo?.management,
          ipi: proInfo?.ipi, pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry, locationName: proInfo?.locationName,
          socialLinks: social && Object.keys(social).length > 0 ? social : undefined,
          spotifyArtistId: spotifyArtistIds[producer.name.toLowerCase()] || undefined,
          appleArtistId: appleArtistIds[producer.name.toLowerCase()] || undefined,
        });
      }
    }

    const dataSource = usedIsrc ? 'isrc' : 'musicbrainz';

    // Cover art fallback via Deezer
    let finalCoverUrl = songData.coverUrl || null;
    if (!finalCoverUrl) {
      try {
        const artistName = songData.artists?.[0]?.name || '';
        const deezerSearchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(`${artistName} ${songData.title}`)}&limit=1`;
        const deezerResp = await fetch(deezerSearchUrl);
        if (deezerResp.ok) {
          const deezerData = await deezerResp.json();
          const firstResult = deezerData?.data?.[0];
          if (firstResult) {
            finalCoverUrl = firstResult.album?.cover_big || firstResult.album?.cover_medium || firstResult.album?.cover || null;
          }
        }
      } catch (e) { console.log('Cover art fallback failed:', e); }
    }

    const result = {
      success: true,
      data: {
        song: {
          title: songData.title,
          artist: songData.artists.map((a: any) => a.name).join(', ') || 'Unknown Artist',
          album: songData.album, releaseDate: songData.releaseDate,
          coverUrl: finalCoverUrl, mbid: songData.mbid,
          recordLabel: songData.exclusiveLicensee || songData.spotifyLabel || songData.recordLabel || songData.copyrightLabel || null,
          isrc: extractedInfo?.isrc || null,
        },
        credits,
        sources: proData.searched || [],
        dataSource,
        creditNames: skipPro ? uniqueNames : undefined,
      },
    };

    console.log('Final result:', JSON.stringify(result).substring(0, 500));
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in song lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup song';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
