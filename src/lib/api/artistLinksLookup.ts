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

/**
 * Look up an artist's DSP and social links via MusicBrainz URL relationships.
 * Returns a map of platform -> URL (e.g. { spotify: "https://...", tidal: "https://..." })
 */
export async function fetchArtistLinks(
  artistName: string,
  mbid?: string
): Promise<Record<string, string>> {
  const cacheKey = (mbid || artistName).toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('artist-links-lookup', {
      body: { mbid, artistName },
    });

    if (error || !data?.success) {
      console.warn('Artist links lookup failed:', error || data?.error);
      return {};
    }

    const links = data.data?.links || {};
    setSessionCache(cacheKey, links);
    return links;
  } catch (e) {
    console.warn('Artist links fetch error:', e);
    return {};
  }
}
