import { supabase } from '@/integrations/supabase/client';

const SESSION_CACHE_PREFIX = 'publisting_artist_links_';
const SESSION_CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCached(key: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_CACHE_TTL) {
      sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
}

function setSessionCache(key: string, data: Record<string, string>) {
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// Map Odesli platform keys to our internal platform keys
const ODESLI_PLATFORM_MAP: Record<string, string> = {
  spotify: 'spotify',
  appleMusic: 'apple_music',
  youtube: 'youtube',
  youtubeMusic: 'youtube_music',
  tidal: 'tidal',
  deezer: 'deezer',
  amazonMusic: 'amazon_music',
  soundcloud: 'soundcloud',
  pandora: 'pandora',
};

/**
 * Fallback: use Odesli/song.link to resolve streaming links for a song,
 * then derive artist platform presence from those links.
 */
async function fetchOdesliFallback(
  artistName: string,
  songTitle?: string
): Promise<Record<string, string>> {
  if (!songTitle) return {};

  try {
    const { data, error } = await supabase.functions.invoke('odesli-lookup', {
      body: { title: songTitle, artist: artistName },
    });

    if (error || !data?.links) return {};

    const links: Record<string, string> = {};
    for (const [platform, url] of Object.entries(data.links)) {
      const mappedKey = ODESLI_PLATFORM_MAP[platform];
      if (mappedKey && typeof url === 'string') {
        links[mappedKey] = url;
      }
    }
    return links;
  } catch {
    return {};
  }
}

/**
 * Look up an artist's DSP and social links via MusicBrainz URL relationships.
 * Falls back to Odesli/song.link when MusicBrainz returns no links.
 * Returns a map of platform -> URL (e.g. { spotify: "https://...", tidal: "https://..." })
 */
export async function fetchArtistLinks(
  artistName: string,
  mbid?: string,
  songTitle?: string
): Promise<Record<string, string>> {
  const cacheKey = (mbid || artistName).toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('artist-links-lookup', {
      body: { mbid, artistName },
    });

    let links: Record<string, string> = {};

    if (!error && data?.success) {
      links = data.data?.links || {};
    }

    // Fallback to Odesli if MusicBrainz returned few or no DSP links
    const dspCount = Object.keys(links).filter(k =>
      ['spotify', 'apple_music', 'tidal', 'deezer', 'amazon_music', 'youtube_music', 'soundcloud', 'pandora'].includes(k)
    ).length;

    if (dspCount < 3 && songTitle) {
      const odesliLinks = await fetchOdesliFallback(artistName, songTitle);
      // Merge: MusicBrainz takes priority, Odesli fills gaps
      links = { ...odesliLinks, ...links };
    }

    if (Object.keys(links).length > 0) {
      setSessionCache(cacheKey, links);
    }
    return links;
  } catch (e) {
    console.warn('Artist links fetch error:', e);

    // Try Odesli as sole fallback
    if (songTitle) {
      const odesliLinks = await fetchOdesliFallback(artistName, songTitle);
      if (Object.keys(odesliLinks).length > 0) {
        setSessionCache(cacheKey, odesliLinks);
      }
      return odesliLinks;
    }
    return {};
  }
}
