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
    let expectedArtist = ''; // Track expected artist for scoring
    
    if (isrc) {
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=isrc:${encodeURIComponent(isrc)}&fmt=json&inc=artist-credits+releases+release-groups`;
    } else {
      let searchParts: string;
      const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      
      if (dashMatch) {
        const part1 = dashMatch[1].trim();
        const part2 = dashMatch[2].trim();
        // Try both orderings: "Artist - Title" and "Title - Artist"
        // Pick the one that returns the best result
        const ordering1 = `artist:"${part1}" AND recording:"${part2}"`;
        const ordering2 = `artist:"${part2}" AND recording:"${part1}"`;
        
        const [result1, result2] = await Promise.all([
          fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(ordering1)}&fmt=json&inc=artist-credits+releases+release-groups&limit=5`, {
            headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
          }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(ordering2)}&fmt=json&inc=artist-credits+releases+release-groups&limit=5`, {
            headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
          }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        
        const bestScore1 = result1?.recordings?.[0]?.score ?? 0;
        const bestScore2 = result2?.recordings?.[0]?.score ?? 0;
        
        if (bestScore2 > bestScore1) {
          // "Title - Artist" ordering is better
          expectedArtist = part2.toLowerCase();
          searchParts = ordering2;
          console.log('Using field search (Title - Artist):', searchParts);
        } else {
          // "Artist - Title" ordering is better (or equal)
          expectedArtist = part1.toLowerCase();
          searchParts = ordering1;
          console.log('Using field search (Artist - Title):', searchParts);
        }
      } else {
        // No dash — try all possible "title / artist" splits via parallel MusicBrainz queries
        // For "Blinding Lights The Weeknd" → try artist:"The Weeknd" recording:"Blinding Lights", etc.
        const cleanQuery = query.replace(/"/g, '').trim();
        const words = cleanQuery.split(/\s+/);
        
        if (words.length >= 2) {
          // Generate candidate splits: first N words = title, remaining = artist, and vice versa
          const candidates: Array<{title: string; artist: string; query: string}> = [];
          for (let i = 1; i < words.length; i++) {
            // Title first, artist last (e.g. "Blinding Lights" / "The Weeknd")
            const t1 = words.slice(0, i).join(' ');
            const a1 = words.slice(i).join(' ');
            candidates.push({ title: t1, artist: a1, query: `artist:"${a1}" AND recording:"${t1}"` });
            // Artist first, title last (e.g. "The Weeknd" / "Blinding Lights")
            candidates.push({ title: a1, artist: t1, query: `artist:"${t1}" AND recording:"${a1}"` });
          }
          
          // Try all candidates in parallel and pick the one with highest-scoring results
          const candidateResults = await Promise.all(candidates.map(async (c) => {
            try {
              const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(c.query)}&fmt=json&inc=artist-credits+releases+release-groups&limit=5`;
              const resp = await fetchWithRetry(url, userAgent);
              if (!resp?.ok) return { ...c, topScore: 0, count: 0 };
              const d = await resp.json();
              const recs = d.recordings || [];
              // Only count results where the title closely matches
              const matching = recs.filter((r: any) => {
                const rt = r.title?.toLowerCase() || '';
                const ct = c.title.toLowerCase();
                return rt === ct || rt.startsWith(ct) || ct.startsWith(rt);
              });
              const topScore = matching.length > 0 ? Math.max(...matching.map((r: any) => r.score || 0)) : 0;
              return { ...c, topScore, count: matching.length };
            } catch {
              return { ...c, topScore: 0, count: 0 };
            }
          }));
          
          // Pick the candidate with the highest top score
          candidateResults.sort((a, b) => b.topScore - a.topScore || b.count - a.count);
          const best = candidateResults[0];
          
          if (best && best.topScore >= 80) {
            expectedArtist = best.artist.toLowerCase();
            searchParts = best.query;
            console.log('Auto-split winner:', searchParts, 'score:', best.topScore);
          } else {
            // Fallback to plain search
            searchParts = cleanQuery;
            console.log('No good split found, using plain search:', searchParts);
          }
        } else {
          searchParts = cleanQuery;
          console.log('Using plain search (short query):', searchParts);
        }
      }
      
      searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(searchParts)}&fmt=json&inc=artist-credits+releases+release-groups&limit=25`;
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

    // Compilation/soundtrack keywords used for both recording and release scoring
    const compilationKeywords = ['piece by piece', 'compilation', 'best of', 
      'hits', 'various', 'karaoke', 'tribute', 'cover', 'essentials', 'collection', 
      'greatest', 'anthology', 'ultimate', 'complete', 'mega', 'ultra', 'awards',
      'éxitos', 'grandes éxitos', 'recopilatorio', 'lo mejor',
      'nominees', 'promo only', 'hitzone', 'nba2k', 'rolling stone', 'toggo',
      'so fresh', 'ministry of sound', 'clubland', 'pop party', 'kidz bop',
      'juno awards', 'top of the pops', 'pure', 'smash hits', 'house masters',
      'defected presents', 'hed kandi', 'café del mar', 'chillout',
      'hot girl summer', 'summer hits', 'winter hits', 'spring hits', 'autumn hits',
      'dance anthems', 'running playlist', 'workout', 'car songs', 'road trip',
      'chart hits', 'top hits', 'viral hits', 'tiktok', 'trending'];

    const isCompilationTitle = (title: string) => {
      const t = title.toLowerCase();
      return compilationKeywords.some(kw => t.includes(kw)) ||
        t.includes('party') || t.includes('now that') ||
        /^now\s+\d+/i.test(t) || /more\s+music/i.test(t) ||
        /hits?\s+\d|bravo|promo\s+only|grammy|music\s+awards|absolute\s+music|big\s+hits|hottest\s+100|no\.?\s*1\s+dj|nrj|radio\s+\d|brit\s+awards|538\s/i.test(t);
    };

    // Extract the expected title and artist from the query for scoring
    let expectedTitle = '';
    if (query) {
      const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        expectedTitle = dashMatch[2].trim().toLowerCase();
        if (!expectedArtist) expectedArtist = dashMatch[1].trim().toLowerCase();
      } else {
        expectedTitle = query.toLowerCase();
      }
    }
    console.log('Expected title:', expectedTitle, 'Expected artist:', expectedArtist);

    // Find the best match
    let bestRecording: MusicBrainzRecording = recordings[0];
    let bestScore = -Infinity;

    for (const recording of recordings) {
      let score = recording.score || 0;
      
      const titleLower = recording.title.toLowerCase();
      
      // Strong bonus for exact title match (most important signal)
      if (expectedTitle && titleLower === expectedTitle) {
        score += 30;
      } else if (expectedTitle && titleLower.includes(expectedTitle) && titleLower !== expectedTitle) {
        // Contains the title but has extra text (remix, mix, version, etc.) — slight penalty
        score -= 10;
      }
      
      // Prefer recordings with more releases (indicates popularity/canonical version)
      const releaseCount = recording.releases?.length || 0;
      score += Math.min(releaseCount * 3, 30); // up to +30 for many releases
      
      // Check release quality — determine if this recording has a "real" (non-compilation) album
      
      const hasNonCompilationAlbum = recording.releases?.some(r => 
        r.status === 'Official' && 
        r['release-group']?.['primary-type'] === 'Album' &&
        !isCompilationTitle(r.title)
      );
      const hasOfficialSingle = recording.releases?.some(r => 
        r.status === 'Official' && 
        r['release-group']?.['primary-type'] === 'Single'
      );
      
      // Check if ALL releases are compilations (likely a radio edit or alternate version)
      const allReleasesAreCompilations = recording.releases?.length > 0 && recording.releases?.every(r => 
        isCompilationTitle(r.title)
      );
      
      if (hasNonCompilationAlbum) score += 25; // Strong bonus for appearing on a real album
      else if (hasOfficialSingle) score += 15;
      if (allReleasesAreCompilations) score -= 40; // Heavy penalty — likely not the canonical recording
      
      if (recording['first-release-date']) score += 5;
      
      // Penalize remixes, live versions, covers, mixes, acoustic, instrumental, etc.
      if (/\b(live|cover|remix|mix|version|edit|acoustic|instrumental|demo|karaoke|remaster)\b/i.test(titleLower)) {
        // Don't penalize if "mix" is part of the expected title
        if (!expectedTitle || !new RegExp(`\\b(mix|remix|version|edit)\\b`, 'i').test(expectedTitle)) {
          score -= 25;
        }
      }
      
      // Artist matching — strongly prefer recordings by the expected artist
      if (expectedArtist) {
        const recordingArtists = (recording['artist-credit'] || []).map(ac => ac.artist.name.toLowerCase());
        const recordingArtistStr = recordingArtists.join(' ');
        const artistMatch = recordingArtists.some(a => 
          a.includes(expectedArtist) || expectedArtist.includes(a)
        ) || recordingArtistStr.includes(expectedArtist);
        
        if (artistMatch) {
          score += 50; // Huge bonus — this is THE artist we're looking for
        } else {
          score -= 30; // Penalty — likely a cover or different artist
        }
      }
      
      // For non-dash queries, check if query words appear in artist name (fuzzy artist match)
      // This is crucial for queries like "Blinding Lights The Weeknd" to prefer The Weeknd over covers
      if (!expectedArtist && query) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
        const recordingArtists = (recording['artist-credit'] || []).map(ac => ac.artist.name.toLowerCase());
        const recordingArtistStr = recordingArtists.join(' ');
        const titleLowerForArtist = recording.title.toLowerCase();
        
        // Check each query word: does it match artist or just the title?
        let artistOnlyMatches = 0;
        let titleOnlyMatches = 0;
        for (const w of queryWords) {
          const inArtist = recordingArtistStr.includes(w);
          const inTitle = titleLowerForArtist.includes(w);
          if (inArtist && !inTitle) artistOnlyMatches++;
          if (inTitle && !inArtist) titleOnlyMatches++;
        }
        
        // Strong bonus when query words appear in the ARTIST (not just title)
        score += artistOnlyMatches * 25;
        
        // Penalize if artist words only appear in title (cover indicator)
        // e.g. "Blinding Lights (The Weeknd Cover)" — "weeknd" is in title, not artist
        if (artistOnlyMatches === 0 && titleOnlyMatches > 0) {
          // Check if the title contains cover/tribute indicators
          if (/\b(cover|tribute|version|rendition|originally\s+by)\b/i.test(titleLowerForArtist)) {
            score -= 50; // Heavy penalty for explicit covers
          }
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestRecording = recording;
      }
    }

    console.log('Selected recording:', bestRecording.title, 'with score:', bestScore, 'releases:', bestRecording.releases?.map(r => r.title));

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
    const trackTitle = bestRecording.title.toLowerCase();
    const artistNames = (bestRecording['artist-credit'] || []).map(ac => ac.artist.name.toLowerCase());
    
    // Build a set of significant words from track title + artist names for relevance checking
    const significantWords = new Set<string>();
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'it', 'my', 'me', 'i', 'you', 'we', 'no', 'so', 'do', 'be', 'if']);
    for (const text of [trackTitle, ...artistNames]) {
      for (const word of text.split(/\s+/)) {
        const clean = word.replace(/[^a-z0-9]/g, '');
        if (clean.length >= 3 && !stopWords.has(clean)) significantWords.add(clean);
      }
    }
    
    // Helper: detect if a string contains mostly non-Latin characters (Japanese, Chinese, Korean, Cyrillic, etc.)
    const isNonLatin = (text: string) => {
      const latinChars = text.replace(/[\s\d\p{P}\p{S}]/gu, '').replace(/[\u0000-\u024F]/g, '');
      const totalChars = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
      return totalChars.length > 0 && latinChars.length / totalChars.length > 0.5;
    };
    
    const scoredReleases = releases.map(r => {
      let score = 0;
      const primaryType = r['release-group']?.['primary-type'] || '';
      if (r.status === 'Official') score += 10;
      if (primaryType === 'Album') score += 40; // Strong preference for albums over singles
      if (primaryType === 'Single') score += 15;
      if (primaryType === 'EP') score += 12;
      if (primaryType === 'Soundtrack') score += 30; // Close to Album — genuine soundtracks should compete
      
      // Check secondary types for Compilation flag (MusicBrainz metadata)
      const secondaryTypes: string[] = r['release-group']?.['secondary-types'] || r['release-group']?.['secondary-type-list'] || [];
      if (secondaryTypes.some((t: string) => t === 'Compilation')) {
        score -= 40; // Heavy penalty — compilations shouldn't beat original releases
      }

      // Penalize outtakes, deluxe, bonus, and reissue editions — prefer original albums
      if (/\b(outtakes?|deluxe|bonus|expanded|remaster(ed)?|reissue|anniversary|special\s+edition|collector'?s?)\b/i.test(r.title)) {
        score -= 10;
      }
      
      const titleLower = r.title.toLowerCase();
      
      // Bonus: release title matches the track title (single matching)
      if (titleLower === trackTitle || titleLower.startsWith(trackTitle + ' ') || titleLower.startsWith(trackTitle + '(')) {
        score += 5;
      }
      
      // Penalize known compilation keywords
      if (isCompilationTitle(r.title)) {
        score -= 50;
      }
      
      // Penalize non-Latin titles (prefer English/Latin releases when the track title is Latin)
      if (!isNonLatin(bestRecording.title) && isNonLatin(r.title)) {
        score -= 20;
      }
      
      // Heuristic: if an Album-typed release title shares NO significant words with the track or artist,
      // it's very likely a compilation (e.g. "Kiss Kiss Play Summer 2019", "Caribe 2020").
      if (primaryType === 'Album') {
        const releaseWords = titleLower.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 3);
        const hasOverlap = releaseWords.some(w => significantWords.has(w));
        if (!hasOverlap && releaseWords.length > 0) {
          score -= 35;
        }
        // Penalize very short album titles (1-2 chars) — likely misattributed or generic
        if (releaseWords.length === 0 && titleLower.replace(/[^a-z0-9]/g, '').length <= 2) {
          score -= 20;
        }
      }
      
      // Penalize "Artist & Friends"-style compilations where the album title contains
      // the artist name plus compilation indicators (e.g. "Eminem & Friendz - The Dirtiest Dozen")
      const isArtistCompilation = artistNames.some(name => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b.*\\b(&|and|presents|featuring|feat\\.?|vs\\.?|friendz?|buddies|crew)\\b`, 'i').test(titleLower) ||
               new RegExp(`\\b(&|and|presents|featuring|feat\\.?|vs\\.?)\\b.*\\b${escaped}\\b`, 'i').test(titleLower);
      });
      if (isArtistCompilation) score -= 30;
      
      if (r.date) score += 5;
      if (r.date) {
        const year = parseInt(r.date.substring(0, 4), 10);
        if (!isNaN(year) && year < 2000) score += 5;
        else if (!isNaN(year) && year < 2015) score += 3;
      }
      return { release: r, score };
    });
    scoredReleases.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.release.date || '9999').localeCompare(b.release.date || '9999');
    });
    let officialRelease = scoredReleases[0]?.release || releases[0];
    console.log('Selected release:', officialRelease?.title, 'score:', scoredReleases[0]?.score);

    // Cross-reference: if best release isn't a studio album, find the album via release browse
    const selectedType = officialRelease?.['release-group']?.['primary-type'];
    if (selectedType !== 'Album' && selectedType !== 'Soundtrack' && officialRelease) {
      try {
        await delay(150);
        // Browse releases that contain this specific recording (no type filter — we filter in code)
        const releaseBrowseUrl = `https://musicbrainz.org/ws/2/release?recording=${bestRecording.id}&status=official&fmt=json&inc=release-groups&limit=50`;
        const relBrowseResp = await fetchWithRetry(releaseBrowseUrl, userAgent);
        if (relBrowseResp?.ok) {
          const relBrowseData = await relBrowseResp.json();
          const albumReleases = (relBrowseData.releases || []) as any[];
          console.log('Cross-ref: found', albumReleases.length, 'album releases for recording');
          
          let bestAlbumRelease: any = null;
          let bestAlbumScore = -Infinity;
          
          for (const rel of albumReleases) {
            const pType = rel['release-group']?.['primary-type'];
            if (pType !== 'Album' && pType !== 'Soundtrack') continue;
            if (isCompilationTitle(rel.title)) continue;
            if (!isNonLatin(bestRecording.title) && isNonLatin(rel.title)) continue;
            
            // Skip releases with Compilation secondary type
            const secTypes: string[] = rel['release-group']?.['secondary-types'] || rel['release-group']?.['secondary-type-list'] || [];
            if (secTypes.some((t: string) => t === 'Compilation')) continue;
            
            let score = 0;
            const isSoundtrack = pType === 'Soundtrack';
            
            // Prefer albums over soundtracks
            if (isSoundtrack) score -= 5;
            
            if (/\b(outtakes?|deluxe|bonus|expanded|remaster(ed)?|reissue|anniversary|special\s+edition|collector'?s?)\b/i.test(rel.title)) {
              score -= 10;
            }
            
            // Light penalty for no word overlap — in cross-reference we already know
            // the recording is on this release, so relevance is pre-confirmed.
            // Soundtracks get an even lighter penalty since titles are often unrelated
            // (e.g. "8 Mile" for Eminem, "The Bodyguard" for Whitney Houston)
            const relTitleLower = rel.title.toLowerCase();
            const relWords = relTitleLower.split(/\s+/).map((w: string) => w.replace(/[^a-z0-9]/g, '')).filter((w: string) => w.length >= 3);
            const hasOverlap = relWords.some((w: string) => significantWords.has(w));
            if (!hasOverlap && relWords.length > 0) {
              score -= isSoundtrack ? 5 : 10; // Mild penalty — prefer overlap but don't block legitimate albums
            }
            // Penalize very short titles (≤2 chars like "E") — likely misattributed
            if (relWords.length === 0 && relTitleLower.replace(/[^a-z0-9]/g, '').length <= 2) {
              score -= 20;
            }
            
            if (rel.date) {
              score += 5;
              const year = parseInt(rel.date.substring(0, 4), 10);
              if (!isNaN(year) && year < 2015) score += 5;
            }
            
            if (score > bestAlbumScore) {
              bestAlbumScore = score;
              bestAlbumRelease = rel;
            }
          }
          
          if (bestAlbumRelease) {
            console.log('Cross-referenced album:', bestAlbumRelease.title, '(replacing', officialRelease.title, ')');
            officialRelease = bestAlbumRelease;
          }
        }
      } catch (e) {
        console.log('Cross-reference failed:', e);
      }
    }

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
