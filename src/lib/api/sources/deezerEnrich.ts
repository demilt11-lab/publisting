import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel } from '@/lib/labelClassifier';

const CACHE_KEY_PREFIX = 'pubcheck_cache_deezer_';
const CACHE_TTL = 30 * 60 * 1000;

function getCached(query: string): any | null {
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

export async function deezerEnrich(songTitle: string, artistName: string): Promise<{
  credits: CreditedPerson[];
  label?: string;
  labelType?: 'major' | 'indie' | 'unknown';
  source: SourceStatus;
}> {
  const query = `${songTitle} ${artistName}`.toLowerCase().trim();
  const cached = getCached(query);
  if (cached) {
    return {
      ...cached,
      source: { name: 'Deezer', status: 'success', recordsFetched: cached.credits?.length || 0, url: 'https://www.deezer.com' },
    };
  }

  try {
    // Deezer API is CORS-friendly
    const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(`${songTitle} ${artistName}`)}&limit=3`;
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const json = await res.json();
    const tracks = json.data || [];

    if (tracks.length === 0) {
      return {
        credits: [],
        source: { name: 'Deezer', status: 'no_data', recordsFetched: 0, url: 'https://www.deezer.com' },
      };
    }

    const track = tracks[0];
    let label: string | undefined;

    // Try to get album details for label
    if (track.album?.id) {
      try {
        const albumRes = await fetch(`https://api.deezer.com/album/${track.album.id}`);
        if (albumRes.ok) {
          const albumData = await albumRes.json();
          label = albumData.label;
        }
      } catch {}
    }

    const credits: CreditedPerson[] = [];
    if (track.artist) {
      credits.push({
        name: track.artist.name,
        role: 'artist',
        recordLabel: label,
        labelType: classifyLabel(label),
        confidence: 0.1,
        sources: ['Deezer'],
      });
    }

    // Try to get contributors from track details
    if (track.id) {
      try {
        const trackRes = await fetch(`https://api.deezer.com/track/${track.id}`);
        if (trackRes.ok) {
          const trackData = await trackRes.json();
          if (trackData.contributors) {
            for (const contrib of trackData.contributors) {
              if (!credits.some(c => c.name.toLowerCase() === contrib.name.toLowerCase())) {
                credits.push({
                  name: contrib.name,
                  role: contrib.role === 'Main' ? 'artist' : 'featuring',
                  recordLabel: label,
                  labelType: classifyLabel(label),
                  confidence: 0.1,
                  sources: ['Deezer'],
                });
              }
            }
          }
        }
      } catch {}
    }

    const result = { credits, label, labelType: classifyLabel(label) };
    setCache(query, result);

    return {
      ...result,
      source: { name: 'Deezer', status: credits.length > 0 ? 'success' : 'partial', recordsFetched: credits.length, url: 'https://www.deezer.com' },
    };
  } catch (e) {
    console.warn('Deezer enrichment failed:', e);
    return {
      credits: [],
      source: { name: 'Deezer', status: 'failed', recordsFetched: 0, url: 'https://www.deezer.com' },
    };
  }
}
