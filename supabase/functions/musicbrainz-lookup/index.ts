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
      let searchParts: string;
      const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      
      if (dashMatch) {
        const artist = dashMatch[1].trim();
        const title = dashMatch[2].trim();
        searchParts = `artist:"${artist}" AND recording:"${title}"`;
        console.log('Using field search:', searchParts);
      } else {
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

    // Find the best match
    let bestRecording: MusicBrainzRecording = recordings[0];
    let bestScore = 0;

    for (const recording of recordings) {
      let score = recording.score || 0;
      
      const hasOfficialRelease = recording.releases?.some(r => 
        r.status === 'Official' && 
        r['release-group']?.['primary-type'] === 'Album'
      );
      
      if (hasOfficialRelease) score += 20;
      if (recording['first-release-date']) score += 5;
      
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

    // Step 1: Fetch recording relations (producers + work link) - single request
    let writers: Array<{ name: string; mbid: string; role: 'writer' }> = [];
    let producers: Array<{ name: string; mbid: string; role: 'producer' }> = [];
    let workId: string | null = null;
    
    try {
      await delay(150); // Minimal rate limit respect
      
      const recordingRelUrl = `https://musicbrainz.org/ws/2/recording/${bestRecording.id}?inc=artist-rels+work-rels&fmt=json`;
      const recordingRelResponse = await fetchWithRetry(recordingRelUrl, userAgent);
      
      if (recordingRelResponse?.ok) {
        const recordingData = await recordingRelResponse.json();
        
        if (recordingData.relations) {
          for (const rel of recordingData.relations) {
            if (rel.artist && ['producer', 'co-producer', 'executive producer'].includes(rel.type)) {
              if (!producers.find(p => p.mbid === rel.artist.id)) {
                producers.push({ name: rel.artist.name, mbid: rel.artist.id, role: 'producer' });
              }
            }
          }
          
          const workRel = recordingData.relations.find((r: any) => r.type === 'performance' && r.work);
          if (workRel?.work?.id) {
            workId = workRel.work.id;
            console.log('Found work:', workRel.work.title, workId);
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch recording relations:', e);
    }

    // Step 2: Run writer lookup, artist locations, and cover art ALL IN PARALLEL
    const uniqueArtistIds = [...new Set((bestRecording['artist-credit'] || []).map(ac => ac.artist.id))].slice(0, 5);
    
    // Determine best release for cover art
    const releases = bestRecording.releases || [];
    const scoredReleases = releases.map(r => {
      let score = 0;
      const primaryType = r['release-group']?.['primary-type'] || '';
      if (r.status === 'Official') score += 10;
      if (primaryType === 'Album') score += 30;
      if (primaryType === 'Single') score += 20;
      if (primaryType === 'EP') score += 15;
      const titleLower = r.title.toLowerCase();
      if (titleLower.includes('party') || titleLower.includes('hits') || 
          titleLower.includes('compilation') || titleLower.includes('best of') ||
          titleLower.includes('now that') || titleLower.includes('various')) {
        score -= 40;
      }
      if (r.date) score += 5;
      return { release: r, score };
    });
    scoredReleases.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.release.date || '9999').localeCompare(b.release.date || '9999');
    });
    const officialRelease = scoredReleases[0]?.release || releases[0];
    console.log('Selected release:', officialRelease?.title);

    // Launch all remaining lookups in parallel (no sequential delays!)
    const parallelTasks: Promise<void>[] = [];
    
    // Parallel task 1: Fetch writers from work
    if (workId) {
      parallelTasks.push((async () => {
        try {
          const writerUrl = `https://musicbrainz.org/ws/2/work/${workId}?inc=artist-rels&fmt=json`;
          const writerResponse = await fetchWithRetry(writerUrl, userAgent);
          if (writerResponse?.ok) {
            const writerData = await writerResponse.json();
            if (writerData.relations) {
              for (const rel of writerData.relations) {
                if (rel.artist && ['writer', 'composer', 'lyricist', 'author'].includes(rel.type)) {
                  if (!writers.find(w => w.mbid === rel.artist.id)) {
                    writers.push({ name: rel.artist.name, mbid: rel.artist.id, role: 'writer' });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log('Writer fetch failed:', e);
        }
      })());
    }
    
    // Parallel task 2: Fetch ALL artist locations concurrently
    const artistLocationById: Record<string, { country?: string; area?: string }> = {};
    if (uniqueArtistIds.length > 0) {
      parallelTasks.push((async () => {
        try {
          await Promise.all(uniqueArtistIds.map(async (artistId) => {
            const artistUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?fmt=json`;
            const artistResp = await fetchWithRetry(artistUrl, userAgent);
            if (!artistResp?.ok) return;
            const artistData = await artistResp.json();
            artistLocationById[artistId] = {
              country: typeof artistData.country === 'string' ? artistData.country : undefined,
              area: typeof artistData.area?.name === 'string' ? artistData.area.name : undefined,
            };
          }));
        } catch (e) {
          console.log('Could not enrich artist locations:', e);
        }
      })());
    }
    
    // Parallel task 3: Fetch cover art
    let coverUrl: string | null = null;
    if (officialRelease?.id) {
      parallelTasks.push((async () => {
        try {
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
      })());
    }
    
    // Wait for all parallel tasks to complete
    await Promise.all(parallelTasks);
    console.log('All parallel tasks completed');

    // Build artists array with locations
    const artists: Array<{ name: string; mbid: string; role: 'artist'; country?: string; area?: string }> = [];
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
