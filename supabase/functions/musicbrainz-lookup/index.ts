const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MusicBrainzRecording {
  id: string;
  title: string;
  score?: number;
  'first-release-date'?: string;
  'artist-credit'?: Array<{
    name: string;
    joinphrase?: string;
    artist: {
      id: string;
      name: string;
    };
  }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    status?: string;
    'release-group'?: {
      'primary-type'?: string;
    };
  }>;
}

interface MusicBrainzWork {
  id: string;
  title: string;
  relations?: Array<{
    type: string;
    direction: string;
    artist?: {
      id: string;
      name: string;
    };
  }>;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, userAgent: string, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
        },
      });
      
      if (response.status === 503) {
        console.log(`Rate limited, waiting ${(i + 1) * 1000}ms before retry...`);
        await delay((i + 1) * 1000);
        continue;
      }
      
      return response;
    } catch (e) {
      console.log(`Fetch error (attempt ${i + 1}):`, e);
      await delay((i + 1) * 500);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, isrc } = await req.json();

    if (!query && !isrc) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query or ISRC is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('MusicBrainz lookup:', { query, isrc });

    const userAgent = 'PubCheck/1.0.0 (contact@pubcheck.app)';
    let searchUrl: string;
    
    if (isrc) {
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=isrc:${encodeURIComponent(isrc)}&fmt=json&inc=artist-credits+releases+release-groups`;
    } else {
      // Parse "Artist - Title" or "Artist Title" format and use field-specific search
      let searchParts: string;
      const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      
      if (dashMatch) {
        const artist = dashMatch[1].trim();
        const title = dashMatch[2].trim();
        // Use MusicBrainz field-specific search for better accuracy
        searchParts = `artist:"${artist}" AND recording:"${title}"`;
        console.log('Using field search:', searchParts);
      } else {
        // Fallback to general search with quotes for phrase matching
        searchParts = `"${query.replace(/"/g, '')}"`;
      }
      
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(searchParts)}&fmt=json&inc=artist-credits+releases+release-groups&limit=15`;
    }

    console.log('Fetching from MusicBrainz:', searchUrl);

    const response = await fetchWithRetry(searchUrl, userAgent);
    
    if (!response || !response.ok) {
      console.error('MusicBrainz API error:', response?.status);
      return new Response(
        JSON.stringify({ success: false, error: `MusicBrainz API error: ${response?.status || 'timeout'}` }),
        { status: response?.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const recordings = (data.recordings || []) as MusicBrainzRecording[];

    if (recordings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: null, message: 'No recordings found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the best match - prefer official releases, studio albums, and higher scores
    let bestRecording: MusicBrainzRecording = recordings[0];
    let bestScore = 0;

    for (const recording of recordings) {
      let score = recording.score || 0;
      
      // Check if this is from an official studio album
      const hasOfficialRelease = recording.releases?.some(r => 
        r.status === 'Official' && 
        r['release-group']?.['primary-type'] === 'Album'
      );
      
      if (hasOfficialRelease) {
        score += 20;
      }
      
      // Prefer recordings with release dates
      if (recording['first-release-date']) {
        score += 5;
      }
      
      // Slight penalty for live/cover indicators in title
      const titleLower = recording.title.toLowerCase();
      if (titleLower.includes('live') || titleLower.includes('cover') || titleLower.includes('remix')) {
        score -= 15;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestRecording = recording;
      }
    }

    console.log('Selected recording:', bestRecording.title, 'with score:', bestScore);

    // Get work details for songwriter info and recording relations for producers
    let writers: Array<{ name: string; mbid: string; role: 'writer' }> = [];
    let producers: Array<{ name: string; mbid: string; role: 'producer' }> = [];
    
    try {
      await delay(300); // Respect rate limiting
      
      // Fetch recording relations for producers
      const recordingRelUrl = `https://musicbrainz.org/ws/2/recording/${bestRecording.id}?inc=artist-rels+work-rels&fmt=json`;
      console.log('Fetching recording relations:', recordingRelUrl);
      
      const recordingRelResponse = await fetchWithRetry(recordingRelUrl, userAgent);
      
      if (recordingRelResponse?.ok) {
        const recordingData = await recordingRelResponse.json();
        console.log('Recording relations:', JSON.stringify(recordingData.relations?.slice(0, 5)));
        
        // Extract producers from recording relations
        if (recordingData.relations) {
          for (const rel of recordingData.relations) {
            if (rel.artist && ['producer', 'co-producer', 'executive producer'].includes(rel.type)) {
              if (!producers.find(p => p.mbid === rel.artist.id)) {
                producers.push({
                  name: rel.artist.name,
                  mbid: rel.artist.id,
                  role: 'producer',
                });
              }
            }
          }
          
          // Also check for work to get writers
          const workRel = recordingData.relations.find((r: any) => r.type === 'performance' && r.work);
          
          if (workRel?.work?.id) {
            console.log('Found work:', workRel.work.title, workRel.work.id);
            
            await delay(300);
            
            // Fetch work details with writer relations
            const writerUrl = `https://musicbrainz.org/ws/2/work/${workRel.work.id}?inc=artist-rels&fmt=json`;
            console.log('Fetching writer details:', writerUrl);
            
            const writerResponse = await fetchWithRetry(writerUrl, userAgent);
            
            if (writerResponse?.ok) {
              const writerData = await writerResponse.json();
              console.log('Writer relations:', JSON.stringify(writerData.relations?.slice(0, 5)));
              
              if (writerData.relations) {
                for (const rel of writerData.relations) {
                  if (rel.artist && ['writer', 'composer', 'lyricist', 'author'].includes(rel.type)) {
                    // Avoid duplicates
                    if (!writers.find(w => w.mbid === rel.artist.id)) {
                      writers.push({
                        name: rel.artist.name,
                        mbid: rel.artist.id,
                        role: 'writer',
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch recording/work details:', e);
    }

    // Extract artists with full credit string, enriched with location
    const artists: Array<{ name: string; mbid: string; role: 'artist'; country?: string; area?: string }> = [];

    // Fetch artist location (country/area) to drive accurate flags in UI
    const artistLocationById: Record<string, { country?: string; area?: string }> = {};
    try {
      const uniqueArtistIds = [...new Set((bestRecording['artist-credit'] || []).map(ac => ac.artist.id))].slice(0, 5);
      for (const artistId of uniqueArtistIds) {
        await delay(250);
        const artistUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?fmt=json`;
        const artistResp = await fetchWithRetry(artistUrl, userAgent);
        if (!artistResp?.ok) continue;
        const artistData = await artistResp.json();
        artistLocationById[artistId] = {
          country: typeof artistData.country === 'string' ? artistData.country : undefined,
          area: typeof artistData.area?.name === 'string' ? artistData.area.name : undefined,
        };
      }
    } catch (e) {
      console.log('Could not enrich artist locations:', e);
    }

    for (const ac of (bestRecording['artist-credit'] || [])) {
      const loc = artistLocationById[ac.artist.id];
      artists.push({
        name: ac.artist.name,
        mbid: ac.artist.id,
        role: 'artist' as const,
        country: loc?.country,
        area: loc?.area,
      });
    }

    // Get release info - prefer the artist's own single/album over compilations
    const releases = bestRecording.releases || [];
    
    // Score each release to find the best one
    const scoredReleases = releases.map(r => {
      let score = 0;
      const primaryType = r['release-group']?.['primary-type'] || '';
      const isOfficial = r.status === 'Official';
      
      if (isOfficial) score += 10;
      
      // Prefer Album (the "real" release) over Single
      if (primaryType === 'Album') score += 30;
      // Single is good but less preferred than the album
      if (primaryType === 'Single') score += 20;
      // EP is decent
      if (primaryType === 'EP') score += 15;
      
      // Penalize compilations heavily - these are "Various Artists" collections
      const titleLower = r.title.toLowerCase();
      if (titleLower.includes('party') || titleLower.includes('hits') || 
          titleLower.includes('compilation') || titleLower.includes('best of') ||
          titleLower.includes('now that') || titleLower.includes('various')) {
        score -= 40;
      }
      
      // Prefer earlier releases (likely the original)
      if (r.date) {
        score += 5;
      }
      
      return { release: r, score };
    });
    
    scoredReleases.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: earlier date wins
      return (a.release.date || '9999').localeCompare(b.release.date || '9999');
    });
    
    const officialRelease = scoredReleases[0]?.release || releases[0];
    console.log('Selected release:', officialRelease?.title, 'from', releases.length, 'candidates');

    // Try to get cover art
    let coverUrl: string | null = null;
    if (officialRelease?.id) {
      try {
        await delay(200);
        const coverResponse = await fetch(`https://coverartarchive.org/release/${officialRelease.id}`, {
          headers: { 'User-Agent': userAgent },
        });
        
        if (coverResponse.ok) {
          const coverData = await coverResponse.json();
          const frontCover = coverData.images?.find((img: any) => img.front === true);
          coverUrl = frontCover?.thumbnails?.['250'] || frontCover?.thumbnails?.small || frontCover?.image || null;
        }
      } catch (e) {
        console.log('Could not fetch cover art:', e);
      }
    }

    const result = {
      success: true,
      data: {
        mbid: bestRecording.id,
        title: bestRecording.title,
        artists,
        writers,
        producers,
        album: officialRelease?.title || null,
        releaseDate: officialRelease?.date || bestRecording['first-release-date'] || null,
        coverUrl,
      },
    };

    console.log('MusicBrainz result:', JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in MusicBrainz lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
