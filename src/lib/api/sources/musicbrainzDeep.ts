import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel } from '@/lib/labelClassifier';
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY_PREFIX = 'publisting_cache_mb_deep_';
const CACHE_TTL = 30 * 60 * 1000;

function getCached(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY_PREFIX + key); return null; }
    return data;
  } catch { return null; }
}
function setCache(key: string, data: any) {
  try { sessionStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export async function musicbrainzDeepLookup(songTitle: string, artistName: string): Promise<{
  credits: CreditedPerson[];
  isrc?: string;
  iswc?: string;
  label?: string;
  source: SourceStatus;
}> {
  const cacheKey = `${songTitle} ${artistName}`.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, source: { name: 'MusicBrainz', status: 'success', recordsFetched: cached.credits?.length || 0, url: 'https://musicbrainz.org' } };
  }

  try {
    const { data: result, error } = await supabase.functions.invoke('musicbrainz-deep-lookup', {
      body: { songTitle, artistName },
    });

    if (error) throw new Error(error.message);

    if (!result?.success || !result?.data) {
      return { credits: [], source: { name: 'MusicBrainz', status: 'no_data', recordsFetched: 0, url: 'https://musicbrainz.org' } };
    }

    const { credits: rawCredits, isrc, iswc, label } = result.data;
    const credits: CreditedPerson[] = (rawCredits || []).map((c: any) => ({
      name: c.name,
      role: c.role,
      confidence: 0.35,
      sources: ['MusicBrainz'],
      mbid: c.mbid,
      recordLabel: c.role === 'artist' && label ? label : undefined,
      labelType: c.role === 'artist' && label ? classifyLabel(label) : undefined,
    }));

    const cacheData = { credits, isrc, iswc, label };
    setCache(cacheKey, cacheData);

    return {
      ...cacheData,
      source: { name: 'MusicBrainz', status: credits.length > 0 ? 'success' : 'partial', recordsFetched: credits.length, url: 'https://musicbrainz.org' },
    };
  } catch (e) {
    console.warn('MusicBrainz deep lookup via edge function failed:', e);
    return { credits: [], source: { name: 'MusicBrainz', status: 'failed', recordsFetched: 0, url: 'https://musicbrainz.org' } };
  }
}
