import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel } from '@/lib/labelClassifier';
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY_PREFIX = 'qoda_cache_discogs_client_';
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

function mapDiscogsRole(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('written') || r.includes('songwriter') || r.includes('lyrics') || r.includes('words')) return 'writer';
  if (r.includes('composed') || r.includes('music by') || r.includes('composer')) return 'composer';
  if (r.includes('produc')) return 'producer';
  if (r.includes('mix')) return 'mixer';
  if (r.includes('engineer') || r.includes('recorded')) return 'engineer';
  if (r.includes('arrang')) return 'arranger';
  if (r.includes('vocal') || r.includes('featuring') || r.includes('feat')) return 'featuring';
  return r;
}

export async function discogsClientLookup(songTitle: string, artistName: string): Promise<{
  credits: CreditedPerson[];
  label?: string;
  source: SourceStatus;
}> {
  const cacheKey = `${songTitle} ${artistName}`.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, source: { name: 'Discogs', status: 'success', recordsFetched: cached.credits?.length || 0, url: 'https://www.discogs.com' } };
  }

  try {
    // Proxy through the existing discogs-lookup edge function which has DISCOGS_TOKEN
    const { data: result, error } = await supabase.functions.invoke('discogs-lookup', {
      body: { title: songTitle, artist: artistName },
    });

    if (error) throw new Error(error.message);

    if (!result?.success || !result?.data) {
      return { credits: [], source: { name: 'Discogs', status: 'no_data', recordsFetched: 0, url: 'https://www.discogs.com' } };
    }

    const discogsData = result.data;
    const credits: CreditedPerson[] = [];
    const seenNames = new Set<string>();

    // Map producers
    for (const p of discogsData.producers || []) {
      if (p.name && !seenNames.has(p.name.toLowerCase())) {
        seenNames.add(p.name.toLowerCase());
        credits.push({
          name: p.name,
          role: 'producer',
          confidence: 0.25,
          sources: ['Discogs'],
        });
      }
    }

    // Map writers
    for (const w of discogsData.writers || []) {
      if (w.name && !seenNames.has(w.name.toLowerCase())) {
        seenNames.add(w.name.toLowerCase());
        credits.push({
          name: w.name,
          role: 'writer',
          confidence: 0.25,
          sources: ['Discogs'],
        });
      }
    }

    // Extract label if available from album field
    const label = discogsData.releaseLabel || undefined;

    const cacheData = { credits, label };
    setCache(cacheKey, cacheData);

    return {
      ...cacheData,
      source: { name: 'Discogs', status: credits.length > 0 ? 'success' : 'partial', recordsFetched: credits.length, url: 'https://www.discogs.com' },
    };
  } catch (e) {
    console.warn('Discogs lookup via edge function failed:', e);
    return { credits: [], source: { name: 'Discogs', status: 'failed', recordsFetched: 0, url: 'https://www.discogs.com' } };
  }
}
