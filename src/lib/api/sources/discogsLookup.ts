import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel, classifyPublisher } from '@/lib/labelClassifier';

const CACHE_KEY_PREFIX = 'qoda_cache_discogs_client_';
const CACHE_TTL = 30 * 60 * 1000;
const DISCOGS_BASE = 'https://api.discogs.com';

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
    const query = encodeURIComponent(`${songTitle} ${artistName}`);
    const res = await fetch(`${DISCOGS_BASE}/database/search?q=${query}&type=release&per_page=3`, {
      headers: {
        'User-Agent': 'Qoda/1.0',
      },
    });

    if (!res.ok) throw new Error(`Discogs ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    if (results.length === 0) {
      return { credits: [], source: { name: 'Discogs', status: 'no_data', recordsFetched: 0, url: 'https://www.discogs.com' } };
    }

    const release = results[0];
    let label = release.label?.[0];
    const credits: CreditedPerson[] = [];
    const seenNames = new Set<string>();

    // Try to get detailed release for credits
    if (release.id) {
      try {
        const detailRes = await fetch(`${DISCOGS_BASE}/releases/${release.id}`, {
          headers: { 'User-Agent': 'Qoda/1.0' },
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          label = detail.labels?.[0]?.name || label;

          // Extract credits
          for (const credit of detail.extraartists || []) {
            const role = mapDiscogsRole(credit.role || '');
            if (role && credit.name && !seenNames.has(credit.name.toLowerCase())) {
              seenNames.add(credit.name.toLowerCase());
              credits.push({
                name: credit.name.replace(/\s*\(\d+\)$/, ''), // Remove Discogs disambiguation numbers
                role,
                recordLabel: label,
                labelType: classifyLabel(label),
                confidence: 0.25,
                sources: ['Discogs'],
              });
            }
          }

          // Main artists
          for (const artist of detail.artists || []) {
            if (artist.name && !seenNames.has(artist.name.toLowerCase())) {
              seenNames.add(artist.name.toLowerCase());
              credits.push({
                name: artist.name.replace(/\s*\(\d+\)$/, ''),
                role: 'artist',
                recordLabel: label,
                labelType: classifyLabel(label),
                confidence: 0.25,
                sources: ['Discogs'],
              });
            }
          }
        }
      } catch {}
    }

    const result = { credits, label };
    setCache(cacheKey, result);

    return {
      ...result,
      source: { name: 'Discogs', status: credits.length > 0 ? 'success' : 'partial', recordsFetched: credits.length, url: 'https://www.discogs.com' },
    };
  } catch (e) {
    console.warn('Discogs client lookup failed:', e);
    return { credits: [], source: { name: 'Discogs', status: 'failed', recordsFetched: 0, url: 'https://www.discogs.com' } };
  }
}
