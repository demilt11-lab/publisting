import { CreditedPerson, SourceStatus } from '@/lib/types/multiSource';
import { classifyLabel, classifyPublisher } from '@/lib/labelClassifier';

const CACHE_KEY_PREFIX = 'qoda_cache_mb_deep_';
const CACHE_TTL = 30 * 60 * 1000;
const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = { Accept: 'application/json', 'User-Agent': 'Qoda/1.0 (https://qoda.app)' };

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

async function mbFetch(path: string): Promise<any> {
  // Rate limit: add small delay
  await new Promise(r => setTimeout(r, 120));
  const res = await fetch(`${MB_BASE}${path}`, { headers: MB_HEADERS });
  if (!res.ok) throw new Error(`MB ${res.status}`);
  return res.json();
}

function mapRelRole(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('writer') || t.includes('lyricist') || t.includes('composer') || t === 'writer') return 'writer';
  if (t.includes('producer')) return 'producer';
  if (t.includes('mix') || t === 'mixer') return 'mixer';
  if (t.includes('engineer') || t === 'recording')) return 'engineer';
  if (t.includes('arranger') || t === 'orchestrator' || t === 'instrument arranger') return 'arranger';
  if (t.includes('performer') || t === 'vocal') return 'artist';
  return t;
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
    // Step 1: Search recordings
    const query = encodeURIComponent(`recording:"${songTitle}" AND artist:"${artistName}"`);
    const searchData = await mbFetch(`/recording?query=${query}&fmt=json&limit=5`);
    const recordings = searchData.recordings || [];

    if (recordings.length === 0) {
      return { credits: [], source: { name: 'MusicBrainz', status: 'no_data', recordsFetched: 0, url: 'https://musicbrainz.org' } };
    }

    const recording = recordings[0];
    const recordingId = recording.id;
    let isrc: string | undefined;
    let iswc: string | undefined;
    let label: string | undefined;

    // Extract ISRC from recording
    if (recording.isrcs?.length > 0) {
      isrc = recording.isrcs[0];
    }

    const credits: CreditedPerson[] = [];
    const seenNames = new Set<string>();

    // Add artists from recording
    for (const ac of recording['artist-credit'] || []) {
      const artist = ac.artist;
      if (artist && !seenNames.has(artist.name.toLowerCase())) {
        seenNames.add(artist.name.toLowerCase());
        credits.push({
          name: artist.name,
          role: 'artist',
          confidence: 0.35,
          sources: ['MusicBrainz'],
          mbid: artist.id,
        });
      }
    }

    // Step 2: Get recording relationships (producers, engineers, etc.)
    try {
      const recDetail = await mbFetch(`/recording/${recordingId}?inc=artist-rels+work-rels&fmt=json`);
      
      for (const rel of recDetail.relations || []) {
        if (rel.type && rel.artist) {
          const role = mapRelRole(rel.type);
          const name = rel.artist.name;
          if (!seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            credits.push({
              name,
              role,
              confidence: 0.35,
              sources: ['MusicBrainz'],
              mbid: rel.artist.id,
            });
          }
        }
      }

      // Step 3: Follow work relationships for composers/lyricists
      const workRels = (recDetail.relations || []).filter((r: any) => r.type === 'performance' && r.work);
      for (const wr of workRels.slice(0, 2)) {
        try {
          const workDetail = await mbFetch(`/work/${wr.work.id}?inc=artist-rels&fmt=json`);
          if (workDetail.iswcs?.length > 0) {
            iswc = workDetail.iswcs[0];
          }
          for (const rel of workDetail.relations || []) {
            if (rel.artist) {
              const role = mapRelRole(rel.type || 'writer');
              const name = rel.artist.name;
              if (!seenNames.has(name.toLowerCase())) {
                seenNames.add(name.toLowerCase());
                credits.push({
                  name,
                  role,
                  confidence: 0.35,
                  sources: ['MusicBrainz'],
                  mbid: rel.artist.id,
                });
              }
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('MB recording detail failed:', e);
    }

    // Step 4: Get label from release
    try {
      const releases = await mbFetch(`/recording/${recordingId}?inc=releases&fmt=json`);
      const release = releases.releases?.[0];
      if (release?.id) {
        const releaseDetail = await mbFetch(`/release/${release.id}?inc=labels&fmt=json`);
        const labelInfo = releaseDetail['label-info']?.[0]?.label;
        if (labelInfo) {
          label = labelInfo.name;
          // Apply label to artist credits
          credits.forEach(c => {
            if (c.role === 'artist') {
              c.recordLabel = label;
              c.labelType = classifyLabel(label);
            }
          });
        }
      }
    } catch {}

    const result = { credits, isrc, iswc, label };
    setCache(cacheKey, result);

    return {
      ...result,
      source: { name: 'MusicBrainz', status: credits.length > 0 ? 'success' : 'partial', recordsFetched: credits.length, url: 'https://musicbrainz.org' },
    };
  } catch (e) {
    console.warn('MusicBrainz deep lookup failed:', e);
    return {
      credits: [],
      source: { name: 'MusicBrainz', status: 'failed', recordsFetched: 0, url: 'https://musicbrainz.org' },
    };
  }
}
