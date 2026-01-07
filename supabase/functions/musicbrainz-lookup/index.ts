const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MusicBrainzRecording {
  id: string;
  title: string;
  'artist-credit'?: Array<{
    name: string;
    artist: {
      id: string;
      name: string;
    };
  }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    'cover-art-archive'?: {
      front: boolean;
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

    // Build search URL - MusicBrainz has a free API with no key required
    const userAgent = 'PubCheck/1.0.0 (contact@pubcheck.app)';
    let searchUrl: string;
    
    if (isrc) {
      // Search by ISRC if available
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=isrc:${encodeURIComponent(isrc)}&fmt=json&inc=artist-credits+releases+work-rels`;
    } else {
      // Search by text query
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&inc=artist-credits+releases`;
    }

    console.log('Fetching from MusicBrainz:', searchUrl);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('MusicBrainz API error:', response.status);
      return new Response(
        JSON.stringify({ success: false, error: `MusicBrainz API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const recordings = data.recordings || [];

    if (recordings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: null, message: 'No recordings found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the best match (first result)
    const recording: MusicBrainzRecording = recordings[0];
    
    // Get work details for songwriter info (requires separate request)
    let workDetails: MusicBrainzWork | null = null;
    try {
      const workUrl = `https://musicbrainz.org/ws/2/recording/${recording.id}?inc=work-rels+artist-rels&fmt=json`;
      const workResponse = await fetch(workUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
        },
      });
      if (workResponse.ok) {
        const workData = await workResponse.json();
        if (workData.relations) {
          const workRel = workData.relations.find((r: any) => r.type === 'performance' && r.work);
          if (workRel?.work) {
            // Fetch work details for writers
            const writerUrl = `https://musicbrainz.org/ws/2/work/${workRel.work.id}?inc=artist-rels&fmt=json`;
            const writerResponse = await fetch(writerUrl, {
              headers: {
                'User-Agent': userAgent,
                'Accept': 'application/json',
              },
            });
            if (writerResponse.ok) {
              workDetails = await writerResponse.json();
            }
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch work details:', e);
    }

    // Extract artists
    const artists = recording['artist-credit']?.map(ac => ({
      name: ac.artist.name,
      mbid: ac.artist.id,
      role: 'artist' as const,
    })) || [];

    // Extract writers from work relations
    const writers: Array<{ name: string; mbid: string; role: 'writer' }> = [];
    if (workDetails?.relations) {
      for (const rel of workDetails.relations) {
        if (rel.artist && (rel.type === 'writer' || rel.type === 'composer' || rel.type === 'lyricist')) {
          writers.push({
            name: rel.artist.name,
            mbid: rel.artist.id,
            role: 'writer',
          });
        }
      }
    }

    // Get release info
    const release = recording.releases?.[0];
    let coverUrl: string | null = null;
    if (release?.id && release['cover-art-archive']?.front) {
      coverUrl = `https://coverartarchive.org/release/${release.id}/front-250`;
    }

    const result = {
      success: true,
      data: {
        mbid: recording.id,
        title: recording.title,
        artists,
        writers,
        album: release?.title || null,
        releaseDate: release?.date || null,
        coverUrl,
      },
    };

    console.log('MusicBrainz result:', result);
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
