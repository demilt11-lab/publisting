import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel } from '@/lib/labelClassifier';

interface ItunesResult {
  trackName: string;
  artistName: string;
  collectionName: string;
  collectionArtistName?: string;
  trackId: number;
  artistId: number;
  copyright?: string;
}

const CACHE_KEY_PREFIX = 'publisting_cache_itunes_';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCached(query: string): { credits: CreditedPerson[]; label?: string } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + query);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY_PREFIX + query);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(query: string, data: any) {
  try { sessionStorage.setItem(CACHE_KEY_PREFIX + query, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export async function itunesLookup(songTitle: string, artistName: string): Promise<{
  credits: CreditedPerson[];
  label?: string;
  labelType?: 'major' | 'indie' | 'unknown';
  source: SourceStatus;
}> {
  const query = `${songTitle} ${artistName}`.toLowerCase().trim();
  const cached = getCached(query);
  if (cached) {
    return {
      credits: cached.credits,
      label: cached.label,
      labelType: classifyLabel(cached.label),
      source: { name: 'iTunes', status: 'success', recordsFetched: cached.credits.length, url: 'https://itunes.apple.com' },
    };
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes ${res.status}`);
    const json = await res.json();
    const results: ItunesResult[] = json.results || [];

    // Find best match
    const match = results.find(r =>
      r.trackName.toLowerCase().includes(songTitle.toLowerCase()) &&
      r.artistName.toLowerCase().includes(artistName.toLowerCase())
    ) || results[0];

    if (!match) {
      return {
        credits: [],
        source: { name: 'iTunes', status: 'no_data', recordsFetched: 0, url: 'https://itunes.apple.com' },
      };
    }

    // Extract label from copyright string
    let label: string | undefined;
    if (match.copyright) {
      // Pattern: "℗ 2023 Label Name" or "© 2023 Label Name"
      const labelMatch = match.copyright.replace(/[℗©]/g, '').replace(/\d{4}/g, '').trim();
      if (labelMatch) label = labelMatch;
    }

    const credits: CreditedPerson[] = [{
      name: match.artistName,
      role: 'artist',
      recordLabel: label,
      labelType: classifyLabel(label),
      confidence: 0.2,
      sources: ['iTunes'],
    }];

    const result = { credits, label };
    setCache(query, result);

    return {
      credits,
      label,
      labelType: classifyLabel(label),
      source: { name: 'iTunes', status: 'success', recordsFetched: 1, url: 'https://itunes.apple.com' },
    };
  } catch (e) {
    console.warn('iTunes lookup failed:', e);
    return {
      credits: [],
      source: { name: 'iTunes', status: 'failed', recordsFetched: 0, url: 'https://itunes.apple.com' },
    };
  }
}
