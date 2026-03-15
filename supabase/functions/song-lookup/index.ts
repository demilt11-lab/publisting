const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ParsedUrl {
  platform: 'spotify' | 'apple' | 'tidal' | 'deezer' | 'youtube' | 'search';
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

/**
 * Search Spotify API for a track and return metadata including ISRC and track ID.
 */
async function searchSpotifyTrack(title: string, artist: string): Promise<{
  isrc: string | null;
  trackId: string | null;
  title: string;
  artist: string;
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
        return {
          isrc: track.external_ids?.isrc || null,
          trackId: track.id,
          title: track.name,
          artist: track.artists?.[0]?.name || artist,
        };
      }
    }

    // Fallback to first result
    const first = tracks[0];
    console.log('Spotify search: using first result:', first.name, 'by', first.artists?.[0]?.name);
    return {
      isrc: first.external_ids?.isrc || null,
      trackId: first.id,
      title: first.name,
      artist: first.artists?.[0]?.name || artist,
    };
  } catch (e) {
    console.log('Spotify search exception:', e);
    return null;
  }
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
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  try {
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
    console.log('Spotify general search:', query);

    const res = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      console.log('Spotify general search failed:', res.status);
      return null;
    }

    const data = await res.json();
    const tracks = data?.tracks?.items || [];
    if (tracks.length === 0) {
      console.log('Spotify general search: no results');
      return null;
    }

    // Spotify's search already ranks by relevance+popularity.
    // Pick the top result but verify query words appear in either artist or title.
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    
    for (const track of tracks) {
      const trackTitle = (track.name || '').toLowerCase();
      const trackArtists = (track.artists || []).map((a: any) => a.name.toLowerCase()).join(' ');
      const combined = `${trackTitle} ${trackArtists}`;
      
      // Check that most query words appear somewhere in artist+title
      const matchingWords = queryWords.filter(w => combined.includes(w));
      const matchRatio = matchingWords.length / queryWords.length;
      
      if (matchRatio >= 0.5) {
        console.log('Spotify general match:', track.name, 'by', track.artists?.[0]?.name, 
          'popularity:', track.popularity, 'ISRC:', track.external_ids?.isrc);
        return {
          isrc: track.external_ids?.isrc || null,
          trackId: track.id,
          title: track.name,
          artist: track.artists?.[0]?.name || '',
        };
      }
    }

    // Fallback to first result if no good word match
    const first = tracks[0];
    console.log('Spotify general search: using first result:', first.name, 'by', first.artists?.[0]?.name);
    return {
      isrc: first.external_ids?.isrc || null,
      trackId: first.id,
      title: first.name,
      artist: first.artists?.[0]?.name || '',
    };
  } catch (e) {
    console.log('Spotify general search exception:', e);
    return null;
  }
}


 * Get track details from Spotify by track ID (for ISRC extraction).
 */
async function getSpotifyTrackById(trackId: string): Promise<{
  isrc: string | null;
  title: string;
  artist: string;
  albumLabel?: string | null;
  albumName?: string | null;
} | null> {
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log('Spotify track fetch failed:', res.status);
      return null;
    }
    const data = await res.json();
    const albumLabel = data.album?.label || null;
    if (albumLabel) console.log('Spotify album.label:', albumLabel);
    return {
      isrc: data.external_ids?.isrc || null,
      title: data.name || '',
      artist: data.artists?.[0]?.name || '',
      albumLabel: albumLabel && albumLabel !== '[no label]' ? albumLabel : null,
      albumName: data.album?.name || null,
    };
  } catch (e) {
    console.log('Spotify track fetch exception:', e);
    return null;
  }
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
      return { platform: 'apple', id: trackId || songMatch?.[1] || albumTrackMatch?.[1], url: input };
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
      return { platform: 'search', query: input, url: input };
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

          // Try first result
          const first = searchData.data[0];
          const trackResp = await fetch(`https://api.deezer.com/track/${first.id}`);
          if (trackResp.ok) {
            const trackData = await trackResp.json();
            if (trackData.isrc) {
              console.log('Got ISRC from Deezer first result:', trackData.isrc);
              return { isrc: trackData.isrc, spotifyTrackId };
            }
          }
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

async function fetchSpotifyInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    // Try Spotify API directly first (fastest, most reliable)
    const spotifyTrackData = await getSpotifyTrackById(trackId);
    if (spotifyTrackData && spotifyTrackData.title && spotifyTrackData.artist) {
      console.log('Got Spotify info via API:', spotifyTrackData.title, 'by', spotifyTrackData.artist, 'ISRC:', spotifyTrackData.isrc);
      
      // If we have ISRC from Spotify API, great - but also try Odesli for cross-links
      let isrc = spotifyTrackData.isrc;
      
      // Still call Odesli to get Deezer ISRC (sometimes more reliable for MB matching)
      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
      const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
      try {
        const odesliResponse = await fetch(odesliUrl);
        if (odesliResponse.ok) {
          const odesliData = await odesliResponse.json();
          const { isrc: odesliIsrc } = await extractIsrc(odesliData, spotifyTrackData.title, spotifyTrackData.artist);
          if (odesliIsrc) isrc = odesliIsrc;
        }
      } catch (e) {
        console.log('Odesli cross-link failed, using Spotify ISRC:', e);
      }

      return {
        title: spotifyTrackData.title,
        artist: spotifyTrackData.artist,
        platform: 'spotify',
        isrc: isrc || undefined,
        spotifyTrackId: trackId,
      };
    }

    // Fallback to Odesli
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
    console.log('Fetching Spotify via Odesli:', odesliUrl);

    const odesliResponse = await fetch(odesliUrl);
    if (odesliResponse.ok) {
      const data = await odesliResponse.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      const { isrc } = await extractIsrc(data, entity?.title, entity?.artistName);

      if (entity && entity.title && entity.artistName) {
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'spotify',
          isrc: isrc || undefined,
          spotifyTrackId: trackId,
        };
      }
    }

    // Fallback: Spotify oEmbed
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await fetch(oembedUrl);
    if (!response.ok) return null;

    const data = await response.json();
    const title = data.title || '';

    if (data.html) {
      const titleAttrMatch = data.html.match(/title="([^"]+)"/);
      if (titleAttrMatch) {
        const embedMatch = titleAttrMatch[1].match(/Spotify Embed:\s*(.+?)\s+by\s+(.+)/i);
        if (embedMatch) {
          return { title: embedMatch[1].trim(), artist: embedMatch[2].trim(), platform: 'spotify', spotifyTrackId: trackId };
        }
      }
    }

    if (title) {
      const byMatch = title.match(/^(.+?)\s+(?:-\s+)?by\s+(.+)$/i);
      if (byMatch) {
        return { title: byMatch[1].trim(), artist: byMatch[2].trim(), platform: 'spotify', spotifyTrackId: trackId };
      }
      return { title: title.trim(), artist: data.author_name || '', platform: 'spotify', spotifyTrackId: trackId };
    }

    return null;
  } catch (error) {
    console.error('Error fetching Spotify info:', error);
    return null;
  }
}

async function fetchAppleMusicInfo(url: string): Promise<ExtractedSongInfo | null> {
  try {
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Apple Music via Odesli:', odesliUrl);

    const response = await fetch(odesliUrl);
    if (response.ok) {
      const data = await response.json();
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
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

    // URL parsing fallback
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      for (let i = 0; i < pathParts.length; i++) {
        if ((pathParts[i] === 'album' || pathParts[i] === 'song') && pathParts[i + 1]) {
          const titleHint = pathParts[i + 1].replace(/-/g, ' ').split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          return { title: titleHint, artist: '', platform: 'apple' };
        }
      }
    } catch (e) { console.log('URL parsing failed:', e); }

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

    const odesliResponse = await fetch(odesliUrl);
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

async function extractSongFromLink(parsed: ParsedUrl): Promise<ExtractedSongInfo | null> {
  console.log('Extracting song info from:', parsed.platform, parsed.id || parsed.url);
  switch (parsed.platform) {
    case 'spotify': if (parsed.id) return fetchSpotifyInfo(parsed.id); break;
    case 'apple': if (parsed.url) return fetchAppleMusicInfo(parsed.url); break;
    case 'tidal': if (parsed.id) return fetchTidalInfo(parsed.id); break;
    case 'deezer': if (parsed.id) return fetchDeezerInfo(parsed.id); break;
    case 'youtube': console.log('YouTube links not fully supported'); return null;
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

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
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

      if (extractedInfo) {
        console.log('Extracted info:', JSON.stringify(extractedInfo));
        if (extractedInfo.title && extractedInfo.artist) {
          searchQuery = `${extractedInfo.artist} - ${extractedInfo.title}`;
        } else if (extractedInfo.title) {
          searchQuery = extractedInfo.title;
        }
      }
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
          const odesliResp = await fetch(odesliUrl);
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
      const titleMatch = mbTitle.includes(extractedTitle) || extractedTitle.includes(mbTitle);
      const artistMatch = mbArtist.includes(extractedArtist) || extractedArtist.includes(mbArtist);
      return titleMatch && artistMatch;
    };

    let useFallbackData = false;
    if (!usedIsrc && mbData?.success && mbData?.data && extractedInfo) {
      if (!isMatchingResult(mbData, extractedInfo)) {
        console.log('MusicBrainz returned different song! Using Odesli data as primary.');
        useFallbackData = true;
      }
    }

    // Determine Spotify track ID for enrichment
    let spotifyTrackId = extractedInfo?.spotifyTrackId || (parsed.platform === 'spotify' ? parsed.id : null);

    // ========== ODESLI FALLBACK PATH ==========
    if ((!mbData?.success || !mbData?.data || useFallbackData) && extractedInfo) {
      console.log('Using Odesli-extracted data as primary source');

      let coverUrl: string | null = null;
      let appleMusicUrl: string | null = null;

      try {
        const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}`;
        const odesliResp = await fetch(odesliUrl);
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
            console.log('Got record label from Spotify API:', fallbackRecordLabel);
          }
          if (!fallbackAlbum && spotTrack?.albumName) {
            fallbackAlbum = spotTrack.albumName;
          }
        } catch (e) { console.log('Spotify label fetch failed:', e); }
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
            body: JSON.stringify({ trackId: spotifyTrackId }),
          }).then(r => r.json()).then(data => ({ source: 'spotify', data }))
            .catch(e => { console.log('Spotify failed:', e); return { source: 'spotify', data: null }; })
        );
      }

      const enrichResults = await Promise.all(enrichPromises);
      console.log('Parallel enrichment completed:', enrichResults.map(r => r.source));

      // ========== CONSENSUS-BASED CREDIT FILTERING (Odesli path) ==========
      const writersBySource: Record<string, Set<string>> = {};
      const producersBySource: Record<string, Set<string>> = {};

      for (const { source, data } of enrichResults) {
        console.log(`${source} response (Odesli fallback):`, JSON.stringify(data));
        if (!data?.success || !data?.data) continue;
        const sourceData = data.data;
        writersBySource[source] = new Set<string>();
        producersBySource[source] = new Set<string>();

        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name) writersBySource[source].add(name.toLowerCase().trim());
        }
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
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

      // Consensus: credit must be in Genius (trusted) or in 2+ sources
      // Exception: if total responding sources <= 2, accept single-source credits
      // (common for Indian, Punjabi, Hindi, and other non-Western music with limited coverage)
      const totalRespondingSources = Object.keys(writersBySource).length + Object.keys(producersBySource).length;
      const lowCoverage = Object.keys({ ...writersBySource, ...producersBySource }).length <= 2;
      console.log('Consensus filter: responding sources =', Object.keys({ ...writersBySource, ...producersBySource }), 'lowCoverage =', lowCoverage);

      const isCorroborated = (name: string, bySourceMap: Record<string, Set<string>>): boolean => {
        const nameLower = name.toLowerCase().trim();
        let sourceCount = 0;
        let inGenius = false;
        for (const [src, names] of Object.entries(bySourceMap)) {
          if (names.has(nameLower)) {
            sourceCount++;
            if (src === 'genius') inGenius = true;
          }
        }
        // If few sources responded, accept any credit (no consensus needed)
        if (lowCoverage) return sourceCount >= 1;
        return inGenius || sourceCount >= 2;
      };

      for (const { source, data } of enrichResults) {
        if (!data?.success || !data?.data) continue;
        const sourceData = data.data;
        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];

        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name && isCorroborated(name, writersBySource) &&
              !geniusWriters.find(x => x.name.toLowerCase() === name.toLowerCase())) {
            geniusWriters.push({ name, role: 'writer' });
          }
        }
        for (const p of sourceProducers) {
          const name = typeof p === 'string' ? p : p?.name;
          if (name && isCorroborated(name, producersBySource) &&
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
        const hasProAffiliation = !!(proInfo?.pro || proInfo?.ipi);
        const hasLabel = !!effectiveLabel;

        let publishingStatus: 'signed' | 'unsigned' | 'unknown' = 'unknown';
        if (hasPublisher || hasLabel) {
          publishingStatus = 'signed';
        } else if (hasProAffiliation) {
          publishingStatus = 'signed';
        } else if (role === 'artist' && hasLabel) {
          publishingStatus = 'signed';
        }

        return { publishingStatus, recordLabel: effectiveLabel || undefined };
      };

      console.log('Odesli path: song-level record label for credit propagation:', fallbackRecordLabel);

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
    }

    // Enrich record label from Spotify API (most accurate source for label info)
    if (spotifyTrackId && !songData.recordLabel) {
      try {
        const spotTrack = await getSpotifyTrackById(spotifyTrackId);
        if (spotTrack?.albumLabel) {
          songData.spotifyLabel = spotTrack.albumLabel;
          console.log('Got record label from Spotify API (MB path):', spotTrack.albumLabel);
        }
        if (!songData.album && spotTrack?.albumName) {
          songData.album = spotTrack.albumName;
        }
      } catch (e) { console.log('Spotify label enrichment failed:', e); }
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
            body: JSON.stringify({ trackId: spotifyTrackId }),
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

    // ========== CONSENSUS-BASED CREDIT FILTERING ==========
    // Track which sources report each credit to avoid false positives.
    // A credit from a secondary source is only included if corroborated by at least one other source.
    // Genius API (structured data) is treated as a trusted/primary source.
    const writersBySource: Record<string, Set<string>> = {};
    const producersBySource: Record<string, Set<string>> = {};

    for (const result of enrichmentResults) {
      const { source, data } = result;
      console.log(`${source} lookup response:`, JSON.stringify(data));
      if (!data?.success || !data?.data) continue;

      const sourceData = data.data;
      writersBySource[source] = new Set<string>();
      producersBySource[source] = new Set<string>();

      const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
      for (const p of sourceProducers) {
        const name = typeof p === 'string' ? p : p?.name;
        if (name && !isLikelyEngineer(name)) {
          producersBySource[source].add(name.toLowerCase().trim());
        }
      }

      const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
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

    // Determine which credits pass consensus: present in >= 2 sources, OR in Genius API (trusted)
    // Exception: if total responding sources <= 2, accept single-source credits
    // (common for Indian, Punjabi, Hindi, and other non-Western music with limited coverage)
    const allRespondingSources = new Set([...Object.keys(writersBySource), ...Object.keys(producersBySource)]);
    const lowCoverage = allRespondingSources.size <= 2;
    console.log('Consensus filter (MB path): responding sources =', [...allRespondingSources], 'lowCoverage =', lowCoverage);

    const isCorroborated = (name: string, bySourceMap: Record<string, Set<string>>): boolean => {
      const nameLower = name.toLowerCase().trim();
      let sourceCount = 0;
      let inGenius = false;
      for (const [src, names] of Object.entries(bySourceMap)) {
        if (names.has(nameLower)) {
          sourceCount++;
          if (src === 'genius') inGenius = true;
        }
      }
      // If few sources responded, accept any credit (no consensus needed)
      if (lowCoverage) return sourceCount >= 1;
      return inGenius || sourceCount >= 2;
    };

    // Now add only corroborated credits
    for (const result of enrichmentResults) {
      const { source, data } = result;
      if (!data?.success || !data?.data) continue;
      const sourceData = data.data;

      const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
      for (const p of sourceProducers) {
        const name = typeof p === 'string' ? p : p?.name;
        if (name && !isLikelyEngineer(name) && isCorroborated(name, producersBySource) &&
            !producers.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())) {
          producers.push(typeof p === 'string' ? { name: p, role: 'producer' } : p);
          console.log(`${source} added producer (corroborated):`, name);
        }
      }

      const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
      for (const w of sourceWriters) {
        const name = typeof w === 'string' ? w : w?.name;
        if (name && isCorroborated(name, writersBySource) &&
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
        .replace(/\s*&\s*/g, ' and ').replace(/\s*,\s+/g, ', ')
        .replace(/^(?:feat\.?|ft\.?|featuring)\s+/i, '')
        .trim();
    };

    const allWriters = [...mbWriters];
    for (const extraWriter of additionalWriters) {
      const normalizedName = normalizeName(extraWriter.name);
      if (!allWriters.find((w: any) => normalizeName(w.name).toLowerCase() === normalizedName.toLowerCase())) {
        allWriters.push({ ...extraWriter, name: normalizedName || extraWriter.name });
      }
    }

    producers = producers.map((p: any) => ({ ...p, name: normalizeName(p.name) || p.name }));

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
      const hasProAffiliation = !!(proInfo?.pro || proInfo?.ipi);
      const hasLabel = !!effectiveLabel;

      let publishingStatus: 'signed' | 'unsigned' | 'unknown' = 'unknown';
      if (hasPublisher) {
        publishingStatus = 'signed';
      } else if (hasProAffiliation) {
        publishingStatus = 'signed';
      } else if (role === 'artist' && hasLabel) {
        // Artists on a known record label are signed (label deal implies professional representation)
        publishingStatus = 'signed';
      }

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
