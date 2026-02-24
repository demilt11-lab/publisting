const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CreditInfo {
  name: string;
  role: 'writer' | 'producer' | 'artist';
}

interface CatalogSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  url?: string;
  role: string;
  credits?: CreditInfo[];
}

async function fetchSongDetails(songId: number, geniusToken: string): Promise<{ writers: CreditInfo[]; producers: CreditInfo[] } | null> {
  try {
    const res = await fetch(
      `https://api.genius.com/songs/${songId}?text_format=plain`,
      { headers: { 'Authorization': `Bearer ${geniusToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const song = data.response?.song;
    if (!song) return null;

    const writers: CreditInfo[] = (song.writer_artists || []).map((w: any) => ({
      name: w.name,
      role: 'writer' as const,
    }));
    const producers: CreditInfo[] = (song.producer_artists || []).map((p: any) => ({
      name: p.name,
      role: 'producer' as const,
    }));

    return { writers, producers };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, role } = await req.json();

    if (!name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Catalog lookup for:', name, 'role:', role);

    const geniusToken = Deno.env.get('GENIUS_TOKEN');
    if (!geniusToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Genius token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Search Genius for the artist
    const searchQuery = encodeURIComponent(name);
    const searchUrl = `https://api.genius.com/search?q=${searchQuery}&per_page=10`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${geniusToken}` },
    });

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Genius search failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json();
    const hits = searchData.response?.hits || [];

    let artistId: number | null = null;
    const nameLower = name.toLowerCase().trim();

    for (const hit of hits) {
      const primaryArtist = hit.result?.primary_artist;
      if (primaryArtist && primaryArtist.name.toLowerCase().trim() === nameLower) {
        artistId = primaryArtist.id;
        break;
      }
    }

    if (!artistId) {
      for (const hit of hits) {
        const pa = hit.result?.primary_artist;
        if (pa && (
          pa.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(pa.name.toLowerCase())
        )) {
          artistId = pa.id;
          break;
        }
      }
    }

    const songs: CatalogSong[] = [];
    const seenIds = new Set<number>();

    if (artistId) {
      // Step 2: Fetch artist's songs (up to 125 via pagination)
      let page = 1;
      const maxPages = 5;

      while (page <= maxPages) {
        const songsUrl = `https://api.genius.com/artists/${artistId}/songs?sort=popularity&per_page=25&page=${page}`;
        const songsRes = await fetch(songsUrl, {
          headers: { 'Authorization': `Bearer ${geniusToken}` },
        });

        if (!songsRes.ok) break;

        const songsData = await songsRes.json();
        const songList = songsData.response?.songs || [];

        if (songList.length === 0) break;

        for (const song of songList) {
          if (seenIds.has(song.id)) continue;
          seenIds.add(song.id);

          songs.push({
            id: song.id,
            title: song.title || 'Unknown',
            artist: song.primary_artist?.name || name,
            album: song.album?.name,
            releaseDate: song.release_date_for_display || song.release_date || undefined,
            url: song.url,
            role: song.primary_artist?.name?.toLowerCase() === nameLower ? 'artist' : 'featured',
          });
        }

        if (songsData.response?.next_page) {
          page++;
        } else {
          break;
        }
      }
    }

    // Step 3: Search for writer/producer credits
    if (role === 'writer' || role === 'producer') {
      const creditSearchUrl = `https://api.genius.com/search?q=${searchQuery}&per_page=20`;
      const creditRes = await fetch(creditSearchUrl, {
        headers: { 'Authorization': `Bearer ${geniusToken}` },
      });

      if (creditRes.ok) {
        const creditData = await creditRes.json();
        const creditHits = creditData.response?.hits || [];

        const detailPromises = creditHits
          .filter((h: any) => !seenIds.has(h.result?.id))
          .slice(0, 10)
          .map(async (hit: any) => {
            const songId = hit.result?.id;
            if (!songId) return null;

            const detailRes = await fetch(
              `https://api.genius.com/songs/${songId}?text_format=plain`,
              { headers: { 'Authorization': `Bearer ${geniusToken}` } }
            );
            if (!detailRes.ok) return null;
            const detailData = await detailRes.json();
            const song = detailData.response?.song;
            if (!song) return null;

            const isWriter = song.writer_artists?.some((w: any) =>
              w.name.toLowerCase().includes(nameLower) || nameLower.includes(w.name.toLowerCase())
            );
            const isProducer = song.producer_artists?.some((p: any) =>
              p.name.toLowerCase().includes(nameLower) || nameLower.includes(p.name.toLowerCase())
            );

            if (isWriter || isProducer) {
              // Also extract all credits from this song
              const credits: CreditInfo[] = [];
              for (const w of (song.writer_artists || [])) {
                credits.push({ name: w.name, role: 'writer' });
              }
              for (const p of (song.producer_artists || [])) {
                if (!credits.some(c => c.name === p.name && c.role === 'producer')) {
                  credits.push({ name: p.name, role: 'producer' });
                }
              }

              return {
                id: song.id,
                title: song.title,
                artist: song.primary_artist?.name || '',
                album: song.album?.name,
                releaseDate: song.release_date_for_display || song.release_date || undefined,
                url: song.url,
                role: isProducer ? 'producer' : 'writer',
                credits,
              } as CatalogSong;
            }
            return null;
          });

        const details = await Promise.all(detailPromises);
        for (const d of details) {
          if (d && !seenIds.has(d.id)) {
            seenIds.add(d.id);
            songs.push(d);
          }
        }
      }
    }

    // Step 4: Fetch song details (writer/producer credits) for ALL songs in one parallel burst
    const songsNeedingCredits = songs.filter(s => !s.credits || s.credits.length === 0);
    const toFetch = songsNeedingCredits.slice(0, 80);

    console.log(`Fetching credits for ${toFetch.length} of ${songs.length} songs (parallel)`);

    const allResults = await Promise.allSettled(
      toFetch.map(song => fetchSongDetails(song.id, geniusToken))
    );

    allResults.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const songIdx = songs.findIndex(s => s.id === toFetch[idx].id);
        if (songIdx >= 0) {
          const allCredits: CreditInfo[] = [
            ...result.value.writers,
            ...result.value.producers,
          ];
          const primaryArtist = songs[songIdx].artist;
          if (primaryArtist && !allCredits.some(c => c.name.toLowerCase() === primaryArtist.toLowerCase())) {
            allCredits.push({ name: primaryArtist, role: 'artist' });
          }
          songs[songIdx].credits = allCredits;
        }
      }
    });

    // Collect all unique credit names across the catalog for PRO cross-referencing
    const allCreditNames = new Set<string>();
    for (const song of songs) {
      if (song.credits) {
        for (const credit of song.credits) {
          allCreditNames.add(credit.name);
        }
      }
    }

    console.log(`Found ${songs.length} songs, ${allCreditNames.size} unique credits for ${name}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          name,
          songs,
          allCreditNames: Array.from(allCreditNames),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Catalog lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
