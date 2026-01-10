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

// Fetch song info from Spotify using oEmbed API
async function fetchSpotifyInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://open.spotify.com/track/${trackId}`;
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    
    console.log('Fetching Spotify oEmbed:', oembedUrl);
    
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
        artist: data.author_name || data.provider_name || '',
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
      console.log('Odesli response for Apple Music:', JSON.stringify(data).substring(0, 500));
      
      // Get the entity info from Odesli
      const entityId = data.entityUniqueId;
      const entity = data.entitiesByUniqueId?.[entityId];
      
      if (entity && entity.title) {
        return {
          title: entity.title || '',
          artist: entity.artistName || '',
          platform: 'apple'
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

// Fetch song info from Tidal using oEmbed API
async function fetchTidalInfo(trackId: string): Promise<ExtractedSongInfo | null> {
  try {
    const url = `https://tidal.com/browse/track/${trackId}`;
    const oembedUrl = `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`;
    
    console.log('Fetching Tidal oEmbed:', oembedUrl);
    
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

// Fetch song info from Deezer using their public API
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
    
    return {
      title: data.title || '',
      artist: data.artist?.name || '',
      platform: 'deezer'
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
    const { query, filterPros } = await req.json();

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
          // Use both artist and title for better MusicBrainz matching
          searchQuery = `${extractedInfo.artist} ${extractedInfo.title}`;
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

    // Step 1: Get song info from MusicBrainz
    console.log('Calling MusicBrainz lookup with query:', searchQuery);
    const mbResponse = await fetch(`${supabaseUrl}/functions/v1/musicbrainz-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: searchQuery }),
    });

    const mbData = await mbResponse.json();
    console.log('MusicBrainz response:', JSON.stringify(mbData));

    if (!mbData.success || !mbData.data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not find song information. Try searching with "Artist - Song Title"' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const songData = mbData.data;

    // Check if MusicBrainz found producers - if not, try Genius then Discogs as fallback
    let producers = songData.producers || [];
    let additionalWriters: any[] = [];
    
    if (producers.length === 0) {
      console.log('No producers from MusicBrainz, trying Genius fallback...');
      try {
        const geniusResponse = await fetch(`${supabaseUrl}/functions/v1/genius-lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ 
            title: songData.title,
            artist: songData.artists[0]?.name,
          }),
        });

        const geniusData = await geniusResponse.json();
        console.log('Genius lookup response:', JSON.stringify(geniusData));
        
        if (geniusData.success && geniusData.data) {
          producers = geniusData.data.producers || [];
          additionalWriters = geniusData.data.writers || [];
          console.log('Genius found producers:', producers.map((p: any) => p.name));
          console.log('Genius found writers:', additionalWriters.map((w: any) => w.name));
        }
      } catch (e) {
        console.log('Genius fallback failed:', e);
      }
    }

    // If still no producers, try Discogs as secondary fallback
    if (producers.length === 0) {
      console.log('No producers from Genius, trying Discogs fallback...');
      try {
        const discogsResponse = await fetch(`${supabaseUrl}/functions/v1/discogs-lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ 
            title: songData.title,
            artist: songData.artists[0]?.name,
          }),
        });

        const discogsData = await discogsResponse.json();
        console.log('Discogs lookup response:', JSON.stringify(discogsData));
        
        if (discogsData.success && discogsData.data) {
          producers = discogsData.data.producers || [];
          // Merge Discogs writers if we don't have many yet
          const discogsWriters = discogsData.data.writers || [];
          for (const dWriter of discogsWriters) {
            if (!additionalWriters.find(w => w.name.toLowerCase() === dWriter.name.toLowerCase())) {
              additionalWriters.push(dWriter);
            }
          }
          console.log('Discogs found producers:', producers.map((p: any) => p.name));
          console.log('Discogs found writers:', discogsWriters.map((w: any) => w.name));
        }
      } catch (e) {
        console.log('Discogs fallback failed:', e);
      }
    }

    // Merge writers from MusicBrainz and Genius
    const allWriters = [...songData.writers];
    for (const geniusWriter of additionalWriters) {
      if (!allWriters.find(w => w.name.toLowerCase() === geniusWriter.name.toLowerCase())) {
        allWriters.push(geniusWriter);
      }
    }

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

    // Step 2: Look up publishing info for all credited people (if we have names)
    let proData: any = { success: true, data: {}, searched: [] };
    
    if (uniqueNames.length > 0) {
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
        ipi: proInfo?.ipi,
        pro: proInfo?.pro,
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
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
        });
      }
    }

    // Add producers
    for (const producer of producers) {
      const proInfo = proData.data?.[producer.name];
      // Don't duplicate if already added
      if (!credits.find(c => c.name === producer.name)) {
        credits.push({
          name: producer.name,
          role: 'producer',
          publishingStatus: proInfo?.publisher ? 'signed' : (proInfo?.pro || proInfo?.ipi ? 'signed' : 'unknown'),
          publisher: proInfo?.publisher,
          ipi: proInfo?.ipi,
          pro: proInfo?.pro,
        });
      }
    }

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
      },
    };

    console.log('Final result:', JSON.stringify(result));

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
