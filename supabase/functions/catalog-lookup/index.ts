const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CreditInfo {
  name: string;
  role: 'writer' | 'producer' | 'artist';
  publisher?: string;
  pro?: string;
  ipi?: string;
  share?: number;
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

// Batched parallel fetcher to avoid timeouts — runs N at a time
async function fetchSongDetailsBatched(
  songIds: { id: number; idx: number }[],
  geniusToken: string,
  batchSize = 10,
): Promise<Map<number, { writers: CreditInfo[]; producers: CreditInfo[] }>> {
  const results = new Map<number, { writers: CreditInfo[]; producers: CreditInfo[] }>();

  for (let i = 0; i < songIds.length; i += batchSize) {
    const batch = songIds.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(({ id }) => fetchSongDetails(id, geniusToken))
    );
    batchResults.forEach((result, bIdx) => {
      if (result.status === 'fulfilled' && result.value) {
        results.set(batch[bIdx].id, result.value);
      }
    });
  }

  return results;
}

async function searchMusicBrainzCredits(artistName: string): Promise<CatalogSong[]> {
  const songs: CatalogSong[] = [];
  try {
    const query = encodeURIComponent(`artist:"${artistName}"`);
    const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=50`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SongCreditsApp/1.0 (contact@example.com)' },
    });
    if (!res.ok) return songs;
    const data = await res.json();
    const recordings = data?.recordings || [];

    for (const rec of recordings) {
      if (!rec.title) continue;
      const primaryArtist = rec['artist-credit']?.[0]?.name || artistName;
      const credits: CreditInfo[] = [];

      for (const ac of (rec['artist-credit'] || [])) {
        if (ac.name) {
          credits.push({ name: ac.name, role: 'artist' });
        }
      }

      songs.push({
        id: rec.id?.hashCode?.() || Math.floor(Math.random() * 100000),
        title: rec.title,
        artist: primaryArtist,
        releaseDate: rec['first-release-date'] || undefined,
        role: primaryArtist.toLowerCase().includes(artistName.toLowerCase()) ? 'artist' : 'featured',
        credits,
      });
    }

    // Also search as writer via work relations
    const workQuery = encodeURIComponent(`artist:"${artistName}" AND type:recording`);
    const workUrl = `https://musicbrainz.org/ws/2/work?query=${workQuery}&fmt=json&limit=25`;
    const workRes = await fetch(workUrl, {
      headers: { 'User-Agent': 'SongCreditsApp/1.0 (contact@example.com)' },
    });
    if (workRes.ok) {
      const workData = await workRes.json();
      for (const work of (workData?.works || [])) {
        if (!work.title) continue;
        const credits: CreditInfo[] = [];
        for (const rel of (work.relations || [])) {
          if (rel.type === 'writer' && rel.artist?.name) {
            credits.push({ name: rel.artist.name, role: 'writer' });
          }
        }
        if (credits.length > 0) {
          songs.push({
            id: Math.floor(Math.random() * 100000),
            title: work.title,
            artist: artistName,
            role: 'writer',
            credits,
          });
        }
      }
    }
  } catch (e) {
    console.error('MusicBrainz catalog search error:', e);
  }
  return songs;
}

// Search Genius for songs where the person is credited as writer/producer (not primary artist)
async function searchGeniusWriterProducerCredits(
  name: string,
  nameLower: string,
  geniusToken: string,
  seenTitles: Set<string>,
): Promise<CatalogSong[]> {
  const found: CatalogSong[] = [];

  // Use multiple search queries to maximize coverage
  const queries = [
    name,
    `${name} songwriter`,
    `${name} producer`,
  ];

  for (const q of queries) {
    try {
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(q)}&per_page=20`;
      const res = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${geniusToken}` },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const hits = data.response?.hits || [];

      const unseen = hits.filter((h: any) => {
        const titleKey = `${h.result?.title}::${h.result?.primary_artist?.name}`.toLowerCase();
        return !seenTitles.has(titleKey);
      }).slice(0, 15);

      const detailResults = await Promise.allSettled(
        unseen.map(async (hit: any) => {
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
        })
      );

      for (const result of detailResults) {
        if (result.status === 'fulfilled' && result.value) {
          const d = result.value;
          const titleKey = `${d.title}::${d.artist}`.toLowerCase();
          if (!seenTitles.has(titleKey)) {
            seenTitles.add(titleKey);
            found.push(d);
          }
        }
      }
    } catch (e) {
      console.error('Genius writer/producer search error:', e);
    }
  }

  return found;
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

    const nameLower = name.toLowerCase().trim();

    // Step 1: Search Genius for the artist — use more results and flexible matching
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(name)}&per_page=20`;
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

    // Exact match first
    for (const hit of hits) {
      const primaryArtist = hit.result?.primary_artist;
      if (primaryArtist && primaryArtist.name.toLowerCase().trim() === nameLower) {
        artistId = primaryArtist.id;
        break;
      }
    }

    // Fuzzy match fallback — also check featured artists
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
        // Check featured artists too
        const featuredArtists = hit.result?.featured_artists || [];
        for (const fa of featuredArtists) {
          if (fa.name?.toLowerCase().trim() === nameLower ||
              fa.name?.toLowerCase().includes(nameLower) ||
              nameLower.includes(fa.name?.toLowerCase() || '')) {
            artistId = fa.id;
            break;
          }
        }
        if (artistId) break;
      }
    }

    // Step 1b: If still no artist ID, try Genius artist search directly
    if (!artistId) {
      try {
        const artistSearchUrl = `https://api.genius.com/search?q=${encodeURIComponent(name)}&per_page=30`;
        const artistSearchRes = await fetch(artistSearchUrl, {
          headers: { 'Authorization': `Bearer ${geniusToken}` },
        });
        if (artistSearchRes.ok) {
          const artistSearchData = await artistSearchRes.json();
          const allArtists = new Map<number, string>();
          for (const hit of (artistSearchData.response?.hits || [])) {
            const pa = hit.result?.primary_artist;
            if (pa) allArtists.set(pa.id, pa.name);
            for (const fa of (hit.result?.featured_artists || [])) {
              if (fa.id && fa.name) allArtists.set(fa.id, fa.name);
            }
          }
          // Find best match from all artists seen
          for (const [id, aName] of allArtists) {
            if (aName.toLowerCase().trim() === nameLower) {
              artistId = id;
              break;
            }
          }
          if (!artistId) {
            for (const [id, aName] of allArtists) {
              if (aName.toLowerCase().includes(nameLower) || nameLower.includes(aName.toLowerCase())) {
                artistId = id;
                break;
              }
            }
          }
        }
      } catch {
        // ignore fallback search errors
      }
    }

    console.log('Resolved Genius artist ID:', artistId);

    const songs: CatalogSong[] = [];
    const seenTitles = new Set<string>();

    if (artistId) {
      // Step 2: Fetch artist's songs — increase to 10 pages (250 songs max)
      let page = 1;
      const maxPages = 10;

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
          const titleKey = `${song.title}::${song.primary_artist?.name}`.toLowerCase();
          if (seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);

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

    console.log(`Found ${songs.length} songs from Genius artist page`);

    // Step 3: ALWAYS search for writer/producer credits (removed role gate)
    const writerProducerSongs = await searchGeniusWriterProducerCredits(name, nameLower, geniusToken, seenTitles);
    songs.push(...writerProducerSongs);
    console.log(`Found ${writerProducerSongs.length} additional songs from writer/producer search`);

    // Step 4: Cross-reference with MusicBrainz for additional songs
    const mbSongs = await searchMusicBrainzCredits(name);
    for (const mbSong of mbSongs) {
      const titleKey = `${mbSong.title}::${mbSong.artist}`.toLowerCase();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        songs.push(mbSong);
      } else {
        // Merge credits from MusicBrainz into existing song
        const existing = songs.find(s => `${s.title}::${s.artist}`.toLowerCase() === titleKey);
        if (existing && mbSong.credits) {
          const existingNames = new Set((existing.credits || []).map(c => c.name.toLowerCase()));
          for (const mc of mbSong.credits) {
            if (!existingNames.has(mc.name.toLowerCase())) {
              existing.credits = existing.credits || [];
              existing.credits.push(mc);
            }
          }
        }
      }
    }
    console.log(`Total songs after MusicBrainz merge: ${songs.length}`);

    // Step 5: Fetch song details (writer/producer credits) in controlled batches of 10
    const songsNeedingCredits = songs.filter(s => !s.credits || s.credits.length === 0);
    const toFetch = songsNeedingCredits.slice(0, 150); // increased limit

    console.log(`Fetching credits for ${toFetch.length} of ${songs.length} songs (batched)`);

    const creditResults = await fetchSongDetailsBatched(
      toFetch.map((song, idx) => ({ id: song.id, idx })),
      geniusToken,
      10, // batch size
    );

    for (const song of toFetch) {
      const details = creditResults.get(song.id);
      if (details) {
        const songIdx = songs.findIndex(s => s.id === song.id);
        if (songIdx >= 0) {
          const allCredits: CreditInfo[] = [
            ...details.writers,
            ...details.producers,
          ];
          const primaryArtist = songs[songIdx].artist;
          if (primaryArtist && !allCredits.some(c => c.name.toLowerCase() === primaryArtist.toLowerCase())) {
            allCredits.push({ name: primaryArtist, role: 'artist' });
          }
          songs[songIdx].credits = allCredits;
        }
      }
    }

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
