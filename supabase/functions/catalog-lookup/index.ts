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
  recordLabel?: string;
  source?: string;
}

// Strict artist name matching — used to filter out songs by artists with similar names.
// Normalize: lowercase, strip punctuation, collapse whitespace.
function normalizeArtistName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns true only when the candidate name matches the target exactly (after normalization).
// We deliberately do NOT use substring matching, which caused massive false positives
// (e.g. "O Banga" matching "Banga", "Banga!", "Bonga", "DJ Banga").
function isExactArtistMatch(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  return normalizeArtistName(candidate) === normalizeArtistName(target);
}

// Returns true if any of the listed artist names matches the target exactly.
function anyExactArtistMatch(names: string[], target: string): boolean {
  return names.some((n) => isExactArtistMatch(n, target));
}

// ── Spotify helpers ──

async function getSpotifyToken(): Promise<string | null> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function searchSpotifyArtistDiscography(
  artistName: string,
  spotifyToken: string,
  seenTitles: Set<string>,
): Promise<CatalogSong[]> {
  const songs: CatalogSong[] = [];
  try {
    // Search for artist
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=5`,
      { headers: { Authorization: `Bearer ${spotifyToken}` } },
    );
    if (!searchRes.ok) return songs;
    const searchData = await searchRes.json();
    const artists = searchData?.artists?.items || [];
    // Require an EXACT artist-name match on Spotify; otherwise abort
    // (otherwise we pick the first popular match, which floods the catalog).
    const artist = artists.find((a: any) => isExactArtistMatch(a.name, artistName));
    if (!artist) {
      console.log(`Spotify: no exact match for "${artistName}" — skipping`);
      return songs;
    }

    // Get all albums (albums + singles only — drop "appears_on" and "compilation"
    // which include unrelated artists' releases the artist was merely featured on).
    const albumTypes = ['album', 'single'];
    const allAlbums: any[] = [];
    for (const albumType of albumTypes) {
      try {
        const albumRes = await fetch(
          `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=${albumType}&limit=50&market=US`,
          { headers: { Authorization: `Bearer ${spotifyToken}` } },
        );
        if (albumRes.ok) {
          const albumData = await albumRes.json();
          allAlbums.push(...(albumData?.items || []));
        }
      } catch { /* continue */ }
    }

    console.log(`Spotify: Found ${allAlbums.length} albums/singles for ${artistName}`);

    // Get tracks from each album (batch — up to 20 albums)
    const albumsToFetch = allAlbums.slice(0, 20);
    const trackResults = await Promise.allSettled(
      albumsToFetch.map(async (album: any) => {
        const tracksRes = await fetch(
          `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
          { headers: { Authorization: `Bearer ${spotifyToken}` } },
        );
        if (!tracksRes.ok) return [];
        const tracksData = await tracksRes.json();
        return (tracksData?.items || []).map((track: any) => ({
          track,
          album,
        }));
      }),
    );

    for (const result of trackResults) {
      if (result.status !== 'fulfilled') continue;
      for (const { track, album } of result.value) {
        const trackArtists: string[] = (track.artists || []).map((a: any) => a.name);
        // Strict: the target artist must appear as one of the track's credited artists.
        if (!anyExactArtistMatch(trackArtists, artistName)) continue;

        const titleKey = `${track.name}::${trackArtists[0] || artistName}`.toLowerCase();
        if (seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);

        const isMainArtist = isExactArtistMatch(trackArtists[0] || '', artistName);

        songs.push({
          id: Math.abs(hashCode(titleKey)),
          title: track.name,
          artist: trackArtists[0] || artistName,
          album: album.name,
          releaseDate: album.release_date || undefined,
          url: track.external_urls?.spotify,
          role: isMainArtist ? 'artist' : 'featured',
          recordLabel: album.label || undefined,
          source: 'Spotify',
        });
      }
    }
  } catch (e) {
    console.error('Spotify discography search error:', e);
  }
  return songs;
}

// ── iTunes / Apple Music helpers ──

async function searchItunesDiscography(
  artistName: string,
  seenTitles: Set<string>,
): Promise<CatalogSong[]> {
  const songs: CatalogSong[] = [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200&attribute=artistTerm`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return songs;
    const data = await res.json();
    const results = data?.results || [];

    for (const item of results) {
      if (item.wrapperType !== 'track' || !item.trackName) continue;
      // Strict: iTunes returns many partial matches — keep only exact artist matches.
      if (!isExactArtistMatch(item.artistName || '', artistName)) continue;

      const titleKey = `${item.trackName}::${item.artistName || artistName}`.toLowerCase();
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      songs.push({
        id: item.trackId || Math.abs(hashCode(titleKey)),
        title: item.trackName,
        artist: item.artistName || artistName,
        album: item.collectionName,
        releaseDate: item.releaseDate ? item.releaseDate.slice(0, 10) : undefined,
        url: item.trackViewUrl,
        role: 'artist',
        recordLabel: item.collectionArtistName || undefined,
        source: 'Apple Music',
      });
    }
  } catch (e) {
    console.error('iTunes discography search error:', e);
  }
  return songs;
}

// ── Deezer helpers ──

async function searchDeezerDiscography(
  artistName: string,
  seenTitles: Set<string>,
): Promise<CatalogSong[]> {
  const songs: CatalogSong[] = [];
  try {
    // Find artist on Deezer
    const searchRes = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!searchRes.ok) return songs;
    const searchData = await searchRes.json();
    const artists = searchData?.data || [];
    // Require an EXACT artist-name match on Deezer; otherwise abort.
    const artist = artists.find((a: any) => isExactArtistMatch(a.name, artistName));
    if (!artist) {
      console.log(`Deezer: no exact match for "${artistName}" — skipping`);
      return songs;
    }

    // Get top tracks
    const tracksRes = await fetch(
      `https://api.deezer.com/artist/${artist.id}/top?limit=100`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!tracksRes.ok) return songs;
    const tracksData = await tracksRes.json();

    for (const track of (tracksData?.data || [])) {
      const titleKey = `${track.title}::${track.artist?.name || artistName}`.toLowerCase();
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      songs.push({
        id: track.id || Math.abs(hashCode(titleKey)),
        title: track.title,
        artist: track.artist?.name || artistName,
        album: track.album?.title,
        url: track.link,
        role: 'artist',
        source: 'Deezer',
      });
    }

    // Also get albums and their tracks for more complete coverage
    try {
      const albumsRes = await fetch(
        `https://api.deezer.com/artist/${artist.id}/albums?limit=50`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (albumsRes.ok) {
        const albumsData = await albumsRes.json();
        const albums = (albumsData?.data || []).slice(0, 10);
        
        const albumTrackResults = await Promise.allSettled(
          albums.map(async (album: any) => {
            const aRes = await fetch(
              `https://api.deezer.com/album/${album.id}`,
              { signal: AbortSignal.timeout(6000) },
            );
            if (!aRes.ok) return [];
            const aData = await aRes.json();
            return (aData?.tracks?.data || []).map((t: any) => ({
              track: t,
              album: aData,
            }));
          }),
        );

        for (const result of albumTrackResults) {
          if (result.status !== 'fulfilled') continue;
          for (const { track, album } of result.value) {
            const titleKey = `${track.title}::${track.artist?.name || artistName}`.toLowerCase();
            if (seenTitles.has(titleKey)) continue;
            seenTitles.add(titleKey);

            songs.push({
              id: track.id || Math.abs(hashCode(titleKey)),
              title: track.title,
              artist: track.artist?.name || artistName,
              album: album.title,
              releaseDate: album.release_date || undefined,
              url: track.link,
              role: 'artist',
              recordLabel: album.label || undefined,
              source: 'Deezer',
            });
          }
        }
      }
    } catch { /* ignore album-level errors */ }
  } catch (e) {
    console.error('Deezer discography search error:', e);
  }
  return songs;
}

// ── Genius helpers (existing) ──

async function fetchSongDetails(songId: number, geniusToken: string): Promise<{ writers: CreditInfo[]; producers: CreditInfo[]; label?: string; releaseDate?: string } | null> {
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

    // Extract label from custom_performances or description
    let label: string | undefined;
    if (song.custom_performances) {
      for (const perf of song.custom_performances) {
        if (perf.label?.toLowerCase().includes('label') || perf.label?.toLowerCase().includes('record')) {
          label = perf.artists?.[0]?.name;
          break;
        }
      }
    }

    return { writers, producers, label, releaseDate: song.release_date_for_display || song.release_date || undefined };
  } catch {
    return null;
  }
}

async function fetchSongDetailsBatched(
  songIds: { id: number; idx: number }[],
  geniusToken: string,
  batchSize = 10,
): Promise<Map<number, { writers: CreditInfo[]; producers: CreditInfo[]; label?: string; releaseDate?: string }>> {
  const results = new Map<number, { writers: CreditInfo[]; producers: CreditInfo[]; label?: string; releaseDate?: string }>();

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
      const allArtistNames: string[] = (rec['artist-credit'] || [])
        .map((ac: any) => ac.name || ac.artist?.name)
        .filter(Boolean);
      // Strict: skip recordings whose artist-credit doesn't include an exact match.
      if (!anyExactArtistMatch(allArtistNames, artistName)) continue;

      const primaryArtist = rec['artist-credit']?.[0]?.name || artistName;
      const credits: CreditInfo[] = [];

      for (const ac of (rec['artist-credit'] || [])) {
        if (ac.name) {
          credits.push({ name: ac.name, role: 'artist' });
        }
      }

      // Extract label from releases
      let recordLabel: string | undefined;
      for (const release of (rec.releases || [])) {
        if (release['label-info']?.[0]?.label?.name) {
          recordLabel = release['label-info'][0].label.name;
          break;
        }
      }

      songs.push({
        id: Math.abs(hashCode(rec.id || `${rec.title}::${primaryArtist}`)),
        title: rec.title,
        artist: primaryArtist,
        releaseDate: rec['first-release-date'] || undefined,
        role: isExactArtistMatch(primaryArtist, artistName) ? 'artist' : 'featured',
        credits,
        recordLabel,
        source: 'MusicBrainz',
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
        let hasExactWriterMatch = false;
        for (const rel of (work.relations || [])) {
          if (rel.type === 'writer' && rel.artist?.name) {
            credits.push({ name: rel.artist.name, role: 'writer' });
            if (isExactArtistMatch(rel.artist.name, artistName)) {
              hasExactWriterMatch = true;
            }
          }
        }
        // Strict: only keep works where the target is one of the writers exactly.
        if (credits.length > 0 && hasExactWriterMatch) {
          songs.push({
            id: Math.abs(hashCode(work.id || work.title)),
            title: work.title,
            artist: artistName,
            role: 'writer',
            credits,
            source: 'MusicBrainz',
          });
        }
      }
    }
  } catch (e) {
    console.error('MusicBrainz catalog search error:', e);
  }
  return songs;
}

async function searchGeniusWriterProducerCredits(
  name: string,
  nameLower: string,
  geniusToken: string,
  seenTitles: Set<string>,
): Promise<CatalogSong[]> {
  const found: CatalogSong[] = [];

  const queries = [name, `${name} songwriter`, `${name} producer`];

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
            isExactArtistMatch(w.name, name)
          );
          const isProducer = song.producer_artists?.some((p: any) =>
            isExactArtistMatch(p.name, name)
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

            // Extract label
            let label: string | undefined;
            if (song.custom_performances) {
              for (const perf of song.custom_performances) {
                if (perf.label?.toLowerCase().includes('label') || perf.label?.toLowerCase().includes('record')) {
                  label = perf.artists?.[0]?.name;
                  break;
                }
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
              recordLabel: label,
              source: 'Genius',
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

// Simple hash function for generating IDs
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
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
    const songs: CatalogSong[] = [];
    const seenTitles = new Set<string>();

    // ── Phase 1: Search all platforms in parallel ──
    const spotifyTokenPromise = getSpotifyToken();

    // Start Genius artist search
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(name)}&per_page=20`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${geniusToken}` },
    });

    let artistId: number | null = null;

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const hits = searchData.response?.hits || [];

      // Exact match only — substring matching produced massive false positives
      // (e.g. searching "O Banga" was resolving to "Banga", "Banga!", "Bonga").
      for (const hit of hits) {
        const primaryArtist = hit.result?.primary_artist;
        if (primaryArtist && isExactArtistMatch(primaryArtist.name, name)) {
          artistId = primaryArtist.id;
          break;
        }
      }

      // Featured-artist exact match fallback
      if (!artistId) {
        for (const hit of hits) {
          const featuredArtists = hit.result?.featured_artists || [];
          for (const fa of featuredArtists) {
            if (fa.id && isExactArtistMatch(fa.name || '', name)) {
              artistId = fa.id;
              break;
            }
          }
          if (artistId) break;
        }
      }

      // Broader Genius search — still require exact match.
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
            for (const [id, aName] of allArtists) {
              if (isExactArtistMatch(aName, name)) { artistId = id; break; }
            }
          }
        } catch { /* ignore */ }
      }
    }

    console.log('Resolved Genius artist ID:', artistId);

    // Fetch Genius artist page songs
    if (artistId) {
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
            source: 'Genius',
          });
        }
        if (songsData.response?.next_page) { page++; } else { break; }
      }
    }

    console.log(`Found ${songs.length} songs from Genius artist page`);

    // ── Phase 2: Parallel platform searches ──
    const spotifyToken = await spotifyTokenPromise;

    const [writerProducerSongs, mbSongs, spotifySongs, itunesSongs, deezerSongs] = await Promise.all([
      searchGeniusWriterProducerCredits(name, nameLower, geniusToken, seenTitles),
      searchMusicBrainzCredits(name),
      spotifyToken ? searchSpotifyArtistDiscography(name, spotifyToken, seenTitles) : Promise.resolve([]),
      searchItunesDiscography(name, seenTitles),
      searchDeezerDiscography(name, seenTitles),
    ]);

    // Merge writer/producer songs
    songs.push(...writerProducerSongs);
    console.log(`Genius writer/producer: +${writerProducerSongs.length}`);

    // Merge MusicBrainz songs (merge credits + labels into existing)
    for (const mbSong of mbSongs) {
      const titleKey = `${mbSong.title}::${mbSong.artist}`.toLowerCase();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        songs.push(mbSong);
      } else {
        const existing = songs.find(s => `${s.title}::${s.artist}`.toLowerCase() === titleKey);
        if (existing) {
          // Merge credits
          if (mbSong.credits) {
            const existingNames = new Set((existing.credits || []).map(c => c.name.toLowerCase()));
            for (const mc of mbSong.credits) {
              if (!existingNames.has(mc.name.toLowerCase())) {
                existing.credits = existing.credits || [];
                existing.credits.push(mc);
              }
            }
          }
          // Fill missing label and release date
          if (!existing.recordLabel && mbSong.recordLabel) existing.recordLabel = mbSong.recordLabel;
          if (!existing.releaseDate && mbSong.releaseDate) existing.releaseDate = mbSong.releaseDate;
        }
      }
    }
    console.log(`MusicBrainz: +${mbSongs.length}`);

    // Merge Spotify songs (label and release date merging)
    for (const spSong of spotifySongs) {
      const titleKey = `${spSong.title}::${spSong.artist}`.toLowerCase();
      const existing = songs.find(s => `${s.title}::${s.artist}`.toLowerCase() === titleKey);
      if (existing) {
        if (!existing.recordLabel && spSong.recordLabel) existing.recordLabel = spSong.recordLabel;
        if (!existing.releaseDate && spSong.releaseDate) existing.releaseDate = spSong.releaseDate;
        if (!existing.album && spSong.album) existing.album = spSong.album;
      } else {
        songs.push(spSong);
      }
    }
    console.log(`Spotify: +${spotifySongs.length}`);

    // Merge iTunes songs
    for (const itSong of itunesSongs) {
      const titleKey = `${itSong.title}::${itSong.artist}`.toLowerCase();
      const existing = songs.find(s => `${s.title}::${s.artist}`.toLowerCase() === titleKey);
      if (existing) {
        if (!existing.recordLabel && itSong.recordLabel) existing.recordLabel = itSong.recordLabel;
        if (!existing.releaseDate && itSong.releaseDate) existing.releaseDate = itSong.releaseDate;
        if (!existing.album && itSong.album) existing.album = itSong.album;
      } else {
        songs.push(itSong);
      }
    }
    console.log(`iTunes: +${itunesSongs.length}`);

    // Merge Deezer songs
    for (const dzSong of deezerSongs) {
      const titleKey = `${dzSong.title}::${dzSong.artist}`.toLowerCase();
      const existing = songs.find(s => `${s.title}::${s.artist}`.toLowerCase() === titleKey);
      if (existing) {
        if (!existing.recordLabel && dzSong.recordLabel) existing.recordLabel = dzSong.recordLabel;
        if (!existing.releaseDate && dzSong.releaseDate) existing.releaseDate = dzSong.releaseDate;
        if (!existing.album && dzSong.album) existing.album = dzSong.album;
      } else {
        songs.push(dzSong);
      }
    }
    console.log(`Deezer: +${deezerSongs.length}`);
    console.log(`Total songs after all platform merges: ${songs.length}`);

    // ── Phase 3: Fetch Genius song details for credits (writer/producer) ──
    const songsNeedingCredits = songs.filter(s => !s.credits || s.credits.length === 0);
    const toFetch = songsNeedingCredits.slice(0, 150);

    console.log(`Fetching credits for ${toFetch.length} of ${songs.length} songs (batched)`);

    const creditResults = await fetchSongDetailsBatched(
      toFetch.map((song, idx) => ({ id: song.id, idx })),
      geniusToken,
      10,
    );

    for (const song of toFetch) {
      const details = creditResults.get(song.id);
      if (details) {
        const songIdx = songs.findIndex(s => s.id === song.id);
        if (songIdx >= 0) {
          const allCredits: CreditInfo[] = [...details.writers, ...details.producers];
          const primaryArtist = songs[songIdx].artist;
          if (primaryArtist && !allCredits.some(c => c.name.toLowerCase() === primaryArtist.toLowerCase())) {
            allCredits.push({ name: primaryArtist, role: 'artist' });
          }
          songs[songIdx].credits = allCredits;
          // Fill label and date from Genius details
          if (!songs[songIdx].recordLabel && details.label) songs[songIdx].recordLabel = details.label;
          if (!songs[songIdx].releaseDate && details.releaseDate) songs[songIdx].releaseDate = details.releaseDate;
        }
      }
    }

    // Collect all unique credit names
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
