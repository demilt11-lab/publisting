const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
}

// Extract song info from various streaming URLs
function parseStreamingUrl(input: string): ParsedUrl {
  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    // Spotify
    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
      if (match) {
        return { platform: 'spotify', id: match[1], url: input };
      }
    }

    // Apple Music
    if (hostname.includes('apple') || hostname.includes('music.apple')) {
      const trackId = urlObj.searchParams.get('i');
      const songMatch = urlObj.pathname.match(/\/song\/[^/]+\/(\d+)/);
      const albumTrackMatch = urlObj.pathname.match(/\/album\/[^/]+\/(\d+)/);
      return { 
        platform: 'apple', 
        id: trackId || songMatch?.[1] || albumTrackMatch?.[1], 
        url: input 
      };
    }

    // Tidal
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      if (match) {
        return { platform: 'tidal', id: match[1], url: input };
      }
    }

    // Deezer
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/track\/(\d+)/);
      if (match) {
        return { platform: 'deezer', id: match[1], url: input };
      }
    }

    // YouTube
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') || 
        (hostname.includes('youtu.be') ? urlObj.pathname.slice(1) : null);
      if (videoId) {
        return { platform: 'youtube', id: videoId, url: input };
      }
    }

    return { platform: 'search', query: input };
  } catch {
    return { platform: 'search', query: input };
  }
}

// Extract ISRC by fetching from Deezer API using the Deezer link from Odesli
async function extractIsrcFromOdesli(data: any): Promise<string | null> {
  // Odesli doesn't include ISRC in its response, but it provides cross-platform links.
  // We can use the Deezer track ID to fetch ISRC from Deezer's public API.
  const deezerLink = data.linksByPlatform?.deezer?.url;
  if (deezerLink) {
    const deezerIdMatch = deezerLink.match(/\/track\/(\d+)/);
    if (deezerIdMatch) {
      try {
        console.log('Fetching ISRC from Deezer API for track:', deezerIdMatch[1]);
        const deezerResp = await fetch(`https://api.deezer.com/track/${deezerIdMatch[1]}`);
        if (deezerResp.ok) {
          const deezerData = await deezerResp.json();
          if (deezerData.isrc) {
            console.log('Got ISRC from Deezer:', deezerData.isrc);
            return deezerData.isrc;
          }
        }
      } catch (e) {
        console.log('Deezer ISRC fetch failed:', e);
      }
    }
  }
  
  return null;
}

// Fetch song info from Spotify using Odesli API (more reliable than oEmbed)
async function fetchSpotifyInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    
    // First try Odesli API - it provides accurate artist + title + potentially ISRC
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
    console.log('Fetching Spotify via Odesli:', odesliUrl);
    
    const odesliResponse = await fetch(odesliUrl);
    if (odesliResponse.ok) {
      const data = await odesliResponse.json();
      console.log('Odesli response for Spotify:', JSON.stringify(data).substring(0, 800));
      
      // Get the entity info from Odesli
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      
      // Try to extract ISRC
      const isrc = await extractIsrcFromOdesli(data);
      if (isrc) {
        console.log('Extracted ISRC from Odesli:', isrc);
      }
      
      if (entity && entity.title && entity.artistName) {
        console.log('Odesli extracted:', entity.title, 'by', entity.artistName, 'ISRC:', isrc);
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'spotify',
          isrc: isrc || undefined,
        };
      }
    } else {
      console.log('Odesli API failed for Spotify:', odesliResponse.status);
    }
    
    // Fallback: Try Spotify oEmbed
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    console.log('Fallback to Spotify oEmbed:', oembedUrl);
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Spotify oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Spotify oEmbed response:', JSON.stringify(data));
    
    const title = data.title || '';
    
    // Parse the HTML iframe for better info
    if (data.html) {
      // Look for title attribute in iframe which has format "Song by Artist"
      const titleAttrMatch = data.html.match(/title="([^"]+)"/);
      if (titleAttrMatch) {
        const iframeTitle = titleAttrMatch[1];
        console.log('Iframe title:', iframeTitle);
        
        // Format: "Spotify Embed: Song by Artist"
        const embedMatch = iframeTitle.match(/Spotify Embed:\s*(.+?)\s+by\s+(.+)/i);
        if (embedMatch) {
          return {
            title: embedMatch[1].trim(),
            artist: embedMatch[2].trim(),
            platform: 'spotify'
          };
        }
      }
    }
    
    // Try parsing the title field directly
    if (title) {
      // Format: "Song by Artist" or "Song - by Artist"
      const byMatch = title.match(/^(.+?)\s+(?:-\s+)?by\s+(.+)$/i);
      if (byMatch) {
        return {
          title: byMatch[1].trim(),
          artist: byMatch[2].trim(),
          platform: 'spotify'
        };
      }
      
      // Format: "Artist - Song" (less common)
      const dashMatch = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        return {
          title: dashMatch[2].trim(),
          artist: dashMatch[1].trim(),
          platform: 'spotify'
        };
      }
      
      // Just the title, artist might be in provider_name
      return {
        title: title.trim(),
        artist: data.author_name || '',
        platform: 'spotify'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Spotify info:', error);
    return null;
  }
}

// Fetch song info from Apple Music using Firecrawl scraping
async function fetchAppleMusicInfo(url: string): Promise<ExtractedSongInfo | null> {
  try {
    // First try Odesli API 
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Apple Music via Odesli:', odesliUrl);
    
    const response = await fetch(odesliUrl);
    if (response.ok) {
      const data = await response.json();
      console.log('Odesli response for Apple Music:', JSON.stringify(data).substring(0, 800));
      
      // Get the entity info from Odesli
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      
      // Try to extract ISRC
      const isrc = await extractIsrcFromOdesli(data);
      if (isrc) {
        console.log('Extracted ISRC from Odesli (Apple Music):', isrc);
      }
      
      if (entity && entity.title) {
        return {
          title: entity.title || '',
          artist: entity.artistName || '',
          platform: 'apple',
          isrc: isrc || undefined,
        };
      }
    } else {
      console.log('Odesli API failed for Apple Music:', response.status);
    }
    
    // Fallback: Use Firecrawl to scrape Apple Music page metadata
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (apiKey) {
      try {
        console.log('Scraping Apple Music page with Firecrawl:', url);
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            formats: ['markdown'],
            onlyMainContent: false,
          }),
        });
        
        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          const markdown = scrapeData?.data?.markdown || '';
          const metadata = scrapeData?.data?.metadata || {};
          
          console.log('Apple Music metadata:', JSON.stringify(metadata));
          console.log('Apple Music content preview:', markdown.substring(0, 300));
          
          // Try to extract from metadata title (usually "Song - Artist - Apple Music")
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
          
          // Try to extract from markdown content
          // Look for song title in heading
          const headingMatch = markdown.match(/^#\s*([^\n]+)/m);
          const byArtistMatch = markdown.match(/by\s+\[?([^\]\n]+)/i);
          
          if (headingMatch) {
            return {
              title: headingMatch[1].trim(),
              artist: byArtistMatch ? byArtistMatch[1].trim() : '',
              platform: 'apple'
            };
          }
        } else {
          console.log('Firecrawl scrape failed:', scrapeResponse.status);
        }
      } catch (e) {
        console.log('Firecrawl fallback failed:', e);
      }
    }
    
    // Last resort: Extract from the URL itself
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      // Look for song or album name in path
      let titleHint = '';
      for (let i = 0; i < pathParts.length; i++) {
        if ((pathParts[i] === 'album' || pathParts[i] === 'song') && pathParts[i + 1]) {
          titleHint = pathParts[i + 1]
            .replace(/-/g, ' ')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          break;
        }
      }
      
      if (titleHint) {
        console.log('Extracted title hint from Apple Music URL:', titleHint);
        return {
          title: titleHint,
          artist: '',
          platform: 'apple'
        };
      }
    } catch (e) {
      console.log('URL parsing failed:', e);
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Apple Music info:', error);
    return null;
  }
}

// Fetch song info from Tidal using Odesli API (for ISRC) with oEmbed fallback
async function fetchTidalInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://tidal.com/browse/track/${trackId}`;
    
    // First try Odesli API for ISRC extraction
    const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    console.log('Fetching Tidal via Odesli:', odesliUrl);
    
    const odesliResponse = await fetch(odesliUrl);
    if (odesliResponse.ok) {
      const data = await odesliResponse.json();
      console.log('Odesli response for Tidal:', JSON.stringify(data).substring(0, 800));
      
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      
      // Try to extract ISRC
      const isrc = await extractIsrcFromOdesli(data);
      if (isrc) {
        console.log('Extracted ISRC from Odesli (Tidal):', isrc);
      }
      
      if (entity && entity.title && entity.artistName) {
        return {
          title: entity.title,
          artist: entity.artistName,
          platform: 'tidal',
          isrc: isrc || undefined,
        };
      }
    } else {
      console.log('Odesli API failed for Tidal:', odesliResponse.status);
    }
    
    // Fallback to oEmbed
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    console.log('Fallback to Tidal oEmbed:', oembedUrl);
    
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      console.log('Tidal oEmbed failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Tidal oEmbed response:', JSON.stringify(data));
    
    return {
      title: data.title || '',
      artist: data.author_name || '',
      platform: 'tidal'
    };
  } catch (error) {
    console.error('Error fetching Tidal info:', error);
    return null;
  }
}

// Fetch song info from Deezer using their public API (includes ISRC)
async function fetchDeezerInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    console.log('Fetching Deezer info for track:', trackId);
    
    const response = await fetch(`https://api.deezer.com/track/${trackId}`);
    if (!response.ok) {
      console.log('Deezer API failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Deezer API response:', JSON.stringify(data));
    
    if (data.error) return null;
    
    // Deezer API directly provides ISRC
    const isrc = data.isrc || null;
    if (isrc) {
      console.log('Extracted ISRC from Deezer:', isrc);
    }
    
    return {
      title: data.title || '',
      artist: data.artist?.name || '',
      platform: 'deezer',
      isrc: isrc || undefined,
    };
  } catch (error) {
    console.error('Error fetching Deezer info:', error);
    return null;
  }
}

// Main function to extract song info from any supported streaming link
async function extractSongFromLink(parsed: ParsedUrl): Promise<ExtractedSongInfo | null> {
  console.log('Extracting song info from:', parsed.platform, parsed.id || parsed.url);
  
  switch (parsed.platform) {
    case 'spotify':
      if (parsed.id) return fetchSpotifyInfo(parsed.id);
      break;
    case 'apple':
      if (parsed.url) return fetchAppleMusicInfo(parsed.url);
      break;
    case 'tidal':
      if (parsed.id) return fetchTidalInfo(parsed.id);
      break;
    case 'deezer':
      if (parsed.id) return fetchDeezerInfo(parsed.id);
      break;
    case 'youtube':
      console.log('YouTube links not fully supported for metadata extraction');
      return null;
  }
  
  return null;
}

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

    // If it's a streaming link, try to extract song info
    if (parsed.platform !== 'search' && (parsed.id || parsed.url)) {
      console.log('Detected streaming link, extracting song info...');
      extractedInfo = await extractSongFromLink(parsed);
      
      if (extractedInfo) {
        console.log('Extracted info:', JSON.stringify(extractedInfo));
        
        if (extractedInfo.title && extractedInfo.artist) {
          // Use "Artist - Title" to trigger field-specific search in MusicBrainz lookup
          searchQuery = `${extractedInfo.artist} - ${extractedInfo.title}`;
        } else if (extractedInfo.title) {
          searchQuery = extractedInfo.title;
        }
        console.log('Search query for MusicBrainz:', searchQuery);
      } else {
        console.log('Could not extract info from link, using original query');
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Step 1: Get song info from MusicBrainz (with ISRC priority, then text fallbacks)
    const callMusicBrainz = async (q: string, isrc?: string) => {
      const body: { query?: string; isrc?: string } = {};
      if (isrc) {
        body.isrc = isrc;
        console.log('Calling MusicBrainz lookup with ISRC:', isrc);
      } else {
        body.query = q;
        console.log('Calling MusicBrainz lookup with query:', q);
      }
      
      const r = await fetch(`${supabaseUrl}/functions/v1/musicbrainz-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      console.log('MusicBrainz response:', JSON.stringify(j).substring(0, 1000));
      return j;
    };

    // Start Odesli cross-link fetch early (in parallel with MB) for URL inputs
    let odesliCrossLinkPromise: Promise<{ appleMusicUrl: string | null } | null> | null = null;
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
            return { appleMusicUrl: aUrl };
          }
        } catch (e) {
          console.log('Early Odesli cross-link fetch failed:', e);
        }
        return null;
      })();
    }

    // Try ISRC lookup first if available (most accurate)
    let mbData: any = null;
    let usedIsrc = false;
    
    if (extractedInfo?.isrc) {
      console.log('Attempting ISRC lookup first:', extractedInfo.isrc);
      mbData = await callMusicBrainz('', extractedInfo.isrc);
      if (mbData?.success && mbData?.data) {
        usedIsrc = true;
        console.log('ISRC lookup succeeded! Found:', mbData.data.title);
      } else {
        console.log('ISRC lookup failed or returned no data, falling back to text search');
        mbData = null;
      }
    }
    
    // Fall back to text search if ISRC didn't work
    if (!mbData) {
      mbData = await callMusicBrainz(searchQuery);
    }

    // If MB couldn't find anything, retry with looser queries before failing
    if (mbData?.success && !mbData?.data) {
      const fallbacks: string[] = [];
      if (extractedInfo?.artist && extractedInfo?.title) {
        fallbacks.push(`${extractedInfo.artist} ${extractedInfo.title}`);
        // Don't fallback to just title - it returns wrong songs!
      } else {
        // If we don't have structured parts, just retry with the original query (trimmed)
        fallbacks.push(String(searchQuery).trim());
      }

      for (const fb of fallbacks) {
        if (!fb || fb === searchQuery) continue;
        console.log('Retrying MusicBrainz lookup with fallback query:', fb);
        mbData = await callMusicBrainz(fb);
        if (mbData?.success && mbData?.data) break;
      }
    }

    // Normalize text for comparison - handle Unicode variants of hyphens, quotes, etc.
    const normalizeForComparison = (text: string): string => {
      return text
        .toLowerCase()
        .trim()
        // Normalize all hyphen/dash variants to regular hyphen
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
        // Normalize quotes
        .replace(/[''`´]/g, "'")
        .replace(/[""„]/g, '"')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove common suffixes for comparison
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/\s*\[.*?\]\s*/g, ' ')
        .trim();
    };

    // Helper to check if MusicBrainz result matches Odesli-extracted info
    const isMatchingResult = (mbResult: any, extracted: ExtractedSongInfo | null): boolean => {
      if (!extracted || !mbResult?.data) return true; // No Odesli data to compare, assume ok
      
      const mbTitle = normalizeForComparison(String(mbResult.data.title || ''));
      const mbArtist = normalizeForComparison(String(mbResult.data.artists?.[0]?.name || ''));
      const extractedTitle = normalizeForComparison(String(extracted.title || ''));
      const extractedArtist = normalizeForComparison(String(extracted.artist || ''));
      
      // Check if title contains the extracted title (partial match ok)
      const titleMatch = mbTitle.includes(extractedTitle) || extractedTitle.includes(mbTitle);
      // Check if artist matches
      const artistMatch = mbArtist.includes(extractedArtist) || extractedArtist.includes(mbArtist);
      
      console.log(`Matching check: MB="${mbTitle}" by "${mbArtist}" vs Odesli="${extractedTitle}" by "${extractedArtist}" -> title:${titleMatch}, artist:${artistMatch}`);
      
      return titleMatch && artistMatch;
    };

    // Validate MusicBrainz result matches the song we're looking for
    // Skip validation if we used ISRC - that's a definitive match
    let useFallbackData = false;
    if (!usedIsrc && mbData?.success && mbData?.data && extractedInfo) {
      if (!isMatchingResult(mbData, extractedInfo)) {
        console.log('MusicBrainz returned a different song! Will use Odesli data as primary source.');
        useFallbackData = true;
      }
    } else if (usedIsrc) {
      console.log('ISRC was used - skipping validation (definitive match)');
    }

    // If MusicBrainz failed or returned wrong song, use Odesli data if available
    if ((!mbData?.success || !mbData?.data || useFallbackData) && extractedInfo) {
      console.log('Using Odesli-extracted data as primary source');
      
      // Fetch cover art + cross-platform links from Odesli
      let coverUrl: string | null = null;
      let appleMusicUrl: string | null = null;
      
      try {
        const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}`;
        const odesliResp = await fetch(odesliUrl);
        if (odesliResp.ok) {
          const odesliData = await odesliResp.json();
          const entityId = odesliData.entityUniqueId;
          const entity = odesliData.entitiesByUniqueId?.[entityId];
          if (entity?.thumbnailUrl) {
            coverUrl = entity.thumbnailUrl;
          }
          // Grab Apple Music cross-link if available (used to scrape credits)
          appleMusicUrl = odesliData?.linksByPlatform?.appleMusic?.url || null;
        }
      } catch (e) {
        console.log('Could not fetch Odesli data:', e);
      }

      // Split combined artist names (e.g., "Wizkid, Asake" or "Wizkid & Asake")
      const artistNames = extractedInfo.artist
        .split(/[,&]|feat\.|ft\.|featuring/i)
        .map((n: string) => n.trim())
        .filter((n: string) => n.length > 0);
      
      console.log('Split artist names:', artistNames);

      // Try Genius to get writers, producers, and basic metadata
      let geniusProducers: Array<{ name: string; role: 'producer' }> = [];
      let geniusWriters: Array<{ name: string; role: 'writer' }> = [];
      let fallbackAlbum: string | null = null;
      let fallbackReleaseDate: string | null = null;

      console.log('Fetching credits from all sources in parallel for Odesli fallback...');

      // Run all enrichment sources in parallel for speed
      const enrichPromises: Promise<{ source: string; data: any }>[] = [];

      // Genius
      enrichPromises.push(
        fetch(`${supabaseUrl}/functions/v1/genius-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ title: extractedInfo.title, artist: artistNames[0] }),
        })
          .then(r => r.json())
          .then(data => ({ source: 'genius', data }))
          .catch(e => { console.log('Genius failed:', e); return { source: 'genius', data: null }; })
      );

      // Discogs
      enrichPromises.push(
        fetch(`${supabaseUrl}/functions/v1/discogs-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({ title: extractedInfo.title, artist: artistNames[0] }),
        })
          .then(r => r.json())
          .then(data => ({ source: 'discogs', data }))
          .catch(e => { console.log('Discogs failed:', e); return { source: 'discogs', data: null }; })
      );

      // Apple Music credits (if cross-link available)
      if (appleMusicUrl) {
        enrichPromises.push(
          fetch(`${supabaseUrl}/functions/v1/apple-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ url: appleMusicUrl }),
          })
            .then(r => r.json())
            .then(data => ({ source: 'apple', data }))
            .catch(e => { console.log('Apple failed:', e); return { source: 'apple', data: null }; })
        );
      }

      // Spotify credits (if we have a track ID)
      const spotifyTrackId = parsed.platform === 'spotify' ? parsed.id : null;
      if (spotifyTrackId) {
        enrichPromises.push(
          fetch(`${supabaseUrl}/functions/v1/spotify-credits-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ trackId: spotifyTrackId }),
          })
            .then(r => r.json())
            .then(data => ({ source: 'spotify', data }))
            .catch(e => { console.log('Spotify failed:', e); return { source: 'spotify', data: null }; })
        );
      }

      const enrichResults = await Promise.all(enrichPromises);
      console.log('Parallel enrichment completed:', enrichResults.map(r => r.source));

      // Process results - merge all credits from all sources
      for (const { source, data } of enrichResults) {
        console.log(`${source} response (Odesli fallback):`, JSON.stringify(data));
        if (!data?.success || !data?.data) continue;

        const sourceData = data.data;
        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];

        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name && !geniusWriters.find(x => x.name.toLowerCase() === name.toLowerCase())) {
            geniusWriters.push({ name, role: 'writer' });
          }
        }
        for (const p of sourceProducers) {
          const name = typeof p === 'string' ? p : p?.name;
          if (name && !geniusProducers.find(x => x.name.toLowerCase() === name.toLowerCase())) {
            geniusProducers.push({ name, role: 'producer' });
          }
        }

        // Fill in album/releaseDate from Genius or Apple
        if (source === 'genius' || source === 'apple') {
          if (!fallbackAlbum && typeof sourceData.album === 'string' && sourceData.album.trim()) {
            fallbackAlbum = sourceData.album.trim();
          }
          if (!fallbackReleaseDate && typeof sourceData.releaseDate === 'string' && sourceData.releaseDate.trim()) {
            fallbackReleaseDate = sourceData.releaseDate.trim();
          }
        }
      }

      console.log('Final writers after all enrichment:', geniusWriters);
      console.log('Final producers after all enrichment:', geniusProducers);

      // Collect all names for PRO lookup
      const allNames = [
        ...artistNames,
        ...geniusWriters.map(w => w.name),
        ...geniusProducers.map(p => p.name),
      ];
      const uniqueNames = [...new Set(allNames)];
      
      console.log('Looking up PRO info for:', uniqueNames);

      // Call PRO lookup for all credits (skip if skipPro is set)
      let proData: any = { success: true, data: {}, searched: [] };
      
      if (uniqueNames.length > 0 && !skipPro) {
        try {
          const proResponse = await fetch(`${supabaseUrl}/functions/v1/pro-lookup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ 
              names: uniqueNames,
              songTitle: extractedInfo.title,
              artist: artistNames[0],
              filterPros,
            }),
          });
          proData = await proResponse.json();
          console.log('PRO lookup response (Odesli fallback):', JSON.stringify(proData));
        } catch (e) {
          console.log('PRO lookup failed for Odesli fallback:', e);
        }
      } else if (skipPro) {
        console.log('Skipping PRO lookup (skipPro=true), returning credits immediately');
      }

      // Build enriched credits with PRO data
      const allCredits: any[] = [];
      
      // Add artists
      for (const artistName of artistNames) {
        const proInfo = proData.data?.[artistName];
        allCredits.push({
          name: artistName,
          role: 'artist' as const,
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.recordLabel ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown')) as 'signed' | 'unsigned' | 'unknown',
          publisher: proInfo?.publisher,
          recordLabel: proInfo?.recordLabel,
          management: proInfo?.management,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry,
          locationName: proInfo?.locationName,
        });
      }
      
      // Add writers
      for (const writer of geniusWriters) {
        const proInfo = proData.data?.[writer.name];
        allCredits.push({
          name: writer.name,
          role: 'writer' as const,
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown') as 'signed' | 'unsigned' | 'unknown',
          publisher: proInfo?.publisher,
          recordLabel: proInfo?.recordLabel,
          management: proInfo?.management,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry,
          locationName: proInfo?.locationName,
        });
      }
      
      // Add producers — allow duplicates across roles so UI can show "Also Producer" badges
      for (const producer of geniusProducers) {
        // Only skip if already added as producer (same role)
        if (allCredits.some(c => c.name.toLowerCase() === producer.name.toLowerCase() && c.role === 'producer')) continue;
        
        const proInfo = proData.data?.[producer.name];
        allCredits.push({
          name: producer.name,
          role: 'producer' as const,
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown') as 'signed' | 'unsigned' | 'unknown',
          publisher: proInfo?.publisher,
          recordLabel: proInfo?.recordLabel,
          management: proInfo?.management,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
          locationCountry: proInfo?.locationCountry,
          locationName: proInfo?.locationName,
        });
      }

      console.log('Total credits found:', allCredits.length);

      const result = {
        success: true,
        data: {
          song: {
            title: extractedInfo.title,
            artist: extractedInfo.artist,
            album: fallbackAlbum,
            releaseDate: fallbackReleaseDate,
            coverUrl,
            mbid: null,
          },
          credits: allCredits,
          sources: proData.searched || ['Genius', 'Streaming Service'],
          dataSource: 'odesli' as const,
          creditNames: skipPro ? uniqueNames : undefined,
        },
      };

      console.log('Final result (Odesli fallback):', JSON.stringify(result).substring(0, 500));
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mbData?.success || !mbData?.data) {
      // Return 200 so the client doesn't treat this as a hard runtime failure
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Could not find song information. Try searching with "Artist - Song Title"',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const songData = mbData.data;

    // Pull Apple Music cross-link from Odesli (only for URL inputs, skip for text searches)
    let appleMusicUrl: string | null = null;
    if (typeof query === 'string' && query.startsWith('http') && odesliCrossLinkPromise) {
      try {
        const odesliResult = await odesliCrossLinkPromise;
        appleMusicUrl = odesliResult?.appleMusicUrl || null;
        console.log('Odesli Apple cross-link:', appleMusicUrl);
      } catch (e) {
        console.log('Could not fetch Apple Music cross-link from Odesli:', e);
      }
    }
    // Normalize arrays coming from upstream sources
    let producers: any[] = Array.isArray(songData.producers) ? songData.producers : [];
    let additionalWriters: any[] = [];
    const mbWriters: any[] = Array.isArray(songData.writers) ? songData.writers : [];

    // Always try enrichment sources to supplement MusicBrainz credits
    // Even when MB has some credits, external sources may have additional or corrected data
    const needsWriters = mbWriters.length === 0;
    const needsProducers = producers.length === 0;
    const shouldEnrich = true; // Always enrich for best coverage

    if (shouldEnrich) {
      console.log('MusicBrainz missing credits; fetching enrichment sources in parallel...', { needsWriters, needsProducers });
      
      // Helper: wrap a fetch promise with a timeout so slow scrapers don't block everything
      const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

      // Prepare all enrichment fetch promises
      const enrichmentPromises: Promise<{ source: string; data: any }>[] = [];
      
      // Genius lookup
      enrichmentPromises.push(
        fetch(`${supabaseUrl}/functions/v1/genius-lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            title: songData.title,
            artist: songData.artists?.[0]?.name,
          }),
        })
          .then(r => r.json())
          .then(data => ({ source: 'genius', data }))
          .catch(e => {
            console.log('Genius enrichment failed:', e);
            return { source: 'genius', data: null };
          })
      );
      
      // Discogs lookup
      enrichmentPromises.push(
        fetch(`${supabaseUrl}/functions/v1/discogs-lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            title: songData.title,
            artist: songData.artists?.[0]?.name,
          }),
        })
          .then(r => r.json())
          .then(data => ({ source: 'discogs', data }))
          .catch(e => {
            console.log('Discogs enrichment failed:', e);
            return { source: 'discogs', data: null };
          })
      );
      
      // Apple Music credits (if we have a cross-link)
      if (appleMusicUrl) {
        enrichmentPromises.push(
          withTimeout(
            fetch(`${supabaseUrl}/functions/v1/apple-credits-lookup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ url: appleMusicUrl }),
            })
              .then(r => r.json())
              .then(data => ({ source: 'apple', data }))
              .catch(e => {
                console.log('Apple credits enrichment failed:', e);
                return { source: 'apple', data: null };
              }),
            15000, // 15s timeout
            { source: 'apple', data: null }
          )
        );
      }
      
      // Spotify credits (if we have a track ID)
      const spotifyTrackId = parsed.platform === 'spotify' ? parsed.id : null;
      if (spotifyTrackId) {
        enrichmentPromises.push(
          withTimeout(
            fetch(`${supabaseUrl}/functions/v1/spotify-credits-lookup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ trackId: spotifyTrackId }),
            })
              .then(r => r.json())
              .then(data => ({ source: 'spotify', data }))
              .catch(e => {
                console.log('Spotify credits enrichment failed:', e);
                return { source: 'spotify', data: null };
              }),
            15000, // 15s timeout
            { source: 'spotify', data: null }
          )
        );
      }
      
      // Wait for all enrichment sources in parallel
      const enrichmentResults = await Promise.all(enrichmentPromises);
      console.log('Parallel enrichment completed:', enrichmentResults.map(r => r.source));
      
      // Process results in priority order: Genius > Discogs > Apple > Spotify
      for (const result of enrichmentResults) {
        const { source, data } = result;
        console.log(`${source} lookup response:`, JSON.stringify(data));
        
        if (!data?.success || !data?.data) continue;
        
        const sourceData = data.data;
        
        // Filter out mixing/mastering engineers that get incorrectly tagged as producers
        const engineerPatterns = [
          /\b(mix(ed|ing)?|master(ed|ing)?|engineer(ed|ing)?|record(ed|ing)?|assist(ant|ed)?)\b/i,
        ];
        const knownEngineers = new Set([
          'serban ghenea', 'manny marroquin', 'dave pensado', 'tony maserati',
          'john hanes', 'josh gudwin', 'neal pogue', 'randy merrill',
          'sam holland', 'cory bice', 'shin kamiyama', 'dave kutch',
          'chris gehringer', 'joe laporta', 'emily lazar', 'dale becker',
          'tom coyne', 'chris athens', 'mike bozzi', 'bob ludwig',
          'bernie grundman', 'brian "big bass" gardner', 'sarah park',
          'saskia whinney', 'john greenham', 'jeremie inhaber',
        ]);
        
        const isLikelyEngineer = (name: string): boolean => {
          return knownEngineers.has(name.toLowerCase().trim());
        };
        
        // Always merge producers from all sources (deduplicated), filtering engineers
        const sourceProducers = Array.isArray(sourceData.producers) ? sourceData.producers : [];
        for (const p of sourceProducers) {
          const name = typeof p === 'string' ? p : p?.name;
          if (name && !isLikelyEngineer(name) && !producers.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())) {
            producers.push(typeof p === 'string' ? { name: p, role: 'producer' } : p);
            console.log(`${source} added producer:`, name);
          } else if (name && isLikelyEngineer(name)) {
            console.log(`${source} skipped engineer:`, name);
          }
        }
        
        // Always merge writers from all sources (deduplicated)
        const sourceWriters = Array.isArray(sourceData.writers) ? sourceData.writers : [];
        for (const w of sourceWriters) {
          const name = typeof w === 'string' ? w : w?.name;
          if (name && !additionalWriters.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())) {
            additionalWriters.push(typeof w === 'string' ? { name: w, role: 'writer' } : w);
            console.log(`${source} added writer:`, name);
          }
        }
        
        // Fill in missing album/releaseDate from Apple
        if (source === 'apple') {
          if (!songData.album && typeof sourceData.album === 'string') {
            songData.album = sourceData.album;
          }
          if (!songData.releaseDate && typeof sourceData.releaseDate === 'string') {
            songData.releaseDate = sourceData.releaseDate;
          }
        }
      }
    }


    // ========== NAME NORMALIZATION ==========
    // Normalize names to reduce duplicates from variations (feat., ft., &, etc.)
    const normalizeName = (name: string): string => {
      return String(name || '')
        .trim()
        // Remove common suffixes/prefixes
        .replace(/\s*\(.*?\)\s*/g, '') // (producer), (writer), etc.
        .replace(/\s*\[.*?\]\s*/g, '') // [BMI], etc.
        // Normalize separators
        .replace(/\s*&\s*/g, ' and ')
        .replace(/\s*,\s+/g, ', ')
        // Remove feat./ft. prefixes if this is a credit name
        .replace(/^(?:feat\.?|ft\.?|featuring)\s+/i, '')
        .trim();
    };

    // Apply normalization and merge writers from MusicBrainz + enrichment sources
    const allWriters = [...mbWriters];
    for (const extraWriter of additionalWriters) {
      const normalizedName = normalizeName(extraWriter.name);
      if (!allWriters.find((w: any) => normalizeName(w.name).toLowerCase() === normalizedName.toLowerCase())) {
        allWriters.push({ ...extraWriter, name: normalizedName || extraWriter.name });
      }
    }

    // Normalize producer names too
    producers = producers.map((p: any) => ({
      ...p,
      name: normalizeName(p.name) || p.name,
    }));

    // Collect all names to look up (artists, writers, producers)
    const allNames = [
      ...songData.artists.map((a: any) => a.name),
      ...allWriters.map((w: any) => w.name),
      ...producers.map((p: any) => p.name),
    ];
    const uniqueNames = [...new Set(allNames)];

    console.log('Found artists:', songData.artists.map((a: any) => a.name));
    console.log('Found writers:', allWriters.map((w: any) => w.name));
    console.log('Found producers:', producers.map((p: any) => p.name));

    // Step 2: Look up publishing info for all credited people (skip if skipPro is set)
    let proData: any = { success: true, data: {}, searched: [] };
    
    if (uniqueNames.length > 0 && !skipPro) {
      console.log('Looking up publishing info for:', uniqueNames);
      const proResponse = await fetch(`${supabaseUrl}/functions/v1/pro-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ 
          names: uniqueNames,
          songTitle: songData.title,
          artist: songData.artists[0]?.name,
          filterPros,
        }),
      });

      proData = await proResponse.json();
      console.log('PRO lookup response:', JSON.stringify(proData));
    } else if (skipPro) {
      console.log('Skipping PRO lookup (skipPro=true), returning credits immediately');
    }

    // Combine results
    const credits = [];

    // Add artists
    for (const artist of songData.artists) {
      const proInfo = proData.data?.[artist.name];
      credits.push({
        name: artist.name,
        role: 'artist',
        publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown'),
        publisher: proInfo?.publisher,
        recordLabel: proInfo?.recordLabel,
        management: proInfo?.management,
        ipi: proInfo?.ipi,
        pro: proInfo?.pro,
        // Prefer MusicBrainz artist location, fallback to PRO lookup location
        locationCountry: artist.country || proInfo?.locationCountry,
        locationName: artist.area || proInfo?.locationName,
      });
    }

    // Add writers
    for (const writer of allWriters) {
      const proInfo = proData.data?.[writer.name];
      // Don't duplicate if already added as artist
      if (!credits.find(c => c.name === writer.name && c.role === 'artist')) {
        credits.push({
          name: writer.name,
          role: 'writer',
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown'),
          publisher: proInfo?.publisher,
          recordLabel: proInfo?.recordLabel,
          management: proInfo?.management,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
          // Use PRO lookup location for writers
          locationCountry: proInfo?.locationCountry,
          locationName: proInfo?.locationName,
        });
      }
    }

    // Add producers — allow duplicates across roles so UI can show "Also Producer" badges
    for (const producer of producers) {
      const proInfo = proData.data?.[producer.name];
      // Only skip if already added as producer (same role)
      if (!credits.find(c => c.name === producer.name && c.role === 'producer')) {
        credits.push({
          name: producer.name,
          role: 'producer',
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown'),
          publisher: proInfo?.publisher,
          recordLabel: proInfo?.recordLabel,
          management: proInfo?.management,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
          // Use PRO lookup location for producers
          locationCountry: proInfo?.locationCountry,
          locationName: proInfo?.locationName,
        });
      }
    }

    // Determine the data source for this result
    const dataSource = usedIsrc ? 'isrc' : 'musicbrainz';

    const result = {
      success: true,
      data: {
        song: {
          title: songData.title,
          artist: songData.artists.map((a: any) => a.name).join(', ') || 'Unknown Artist',
          album: songData.album,
          releaseDate: songData.releaseDate,
          coverUrl: songData.coverUrl,
          mbid: songData.mbid,
        },
        credits,
        sources: proData.searched || [],
        dataSource,
        creditNames: skipPro ? uniqueNames : undefined,
      },
    };

    console.log('Final result:', JSON.stringify(result).substring(0, 500));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in song lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup song';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
