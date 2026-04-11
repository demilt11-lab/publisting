import { CreditedPerson, MultiSourceResult, SourceStatus } from '@/lib/types/multiSource';
import { musicbrainzDeepLookup } from './sources/musicbrainzDeep';
import { discogsClientLookup } from './sources/discogsLookup';
import { itunesLookup } from './sources/itunesLookup';
import { deezerEnrich } from './sources/deezerEnrich';
import { buildAllProLinks } from './sources/proLinksBuilder';
import { classifyLabel, classifyPublisher } from '@/lib/labelClassifier';

// Confidence weights per source
const SOURCE_WEIGHTS: Record<string, number> = {
  MusicBrainz: 0.35,
  Discogs: 0.25,
  iTunes: 0.20,
  Spotify: 0.20,
  Deezer: 0.10,
  PRO: 0.10,
};

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function mergeCredits(allCredits: CreditedPerson[][]): CreditedPerson[] {
  const merged = new Map<string, CreditedPerson>();

  for (const credits of allCredits) {
    for (const credit of credits) {
      const key = normalizedName(credit.name);
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, { ...credit });
      } else {
        // Merge sources
        const newSources = new Set([...existing.sources, ...credit.sources]);
        existing.sources = Array.from(newSources);

        // Recalculate confidence based on number of confirming sources
        let conf = 0;
        for (const src of existing.sources) {
          conf += SOURCE_WEIGHTS[src] || 0.05;
        }
        existing.confidence = Math.min(1, conf);

        // Prefer more specific role (writer > artist)
        if (existing.role === 'artist' && ['writer', 'producer', 'composer', 'lyricist'].includes(credit.role)) {
          existing.role = credit.role;
        }

        // Merge metadata
        if (!existing.publishingCompany && credit.publishingCompany) {
          existing.publishingCompany = credit.publishingCompany;
          existing.publishingType = credit.publishingType;
        }
        if (!existing.recordLabel && credit.recordLabel) {
          existing.recordLabel = credit.recordLabel;
          existing.labelType = credit.labelType;
        }
        if (!existing.pro && credit.pro) existing.pro = credit.pro;
        if (!existing.ipi && credit.ipi) existing.ipi = credit.ipi;
        if (!existing.mbid && credit.mbid) existing.mbid = credit.mbid;
        if (!existing.spotifyArtistId && credit.spotifyArtistId) existing.spotifyArtistId = credit.spotifyArtistId;
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

function computeOverallConfidence(credits: CreditedPerson[], sources: SourceStatus[]): number {
  if (credits.length === 0) return 0;
  const successSources = sources.filter(s => s.status === 'success' || s.status === 'partial').length;
  const totalSources = sources.length;
  const sourceRatio = successSources / Math.max(totalSources, 1);

  const avgCredit = credits.reduce((s, c) => s + c.confidence, 0) / credits.length;

  return Math.round(Math.min(1, (sourceRatio * 0.4 + avgCredit * 0.6)) * 100);
}

export async function multiSourceSongLookup(songTitle: string, artistName: string): Promise<MultiSourceResult> {
  // proLinks will be rebuilt after we know the ISRC
  let proLinks = buildAllProLinks(songTitle, artistName);

  // Run all source lookups in parallel
  const results = await Promise.allSettled([
    musicbrainzDeepLookup(songTitle, artistName),
    discogsClientLookup(songTitle, artistName),
    itunesLookup(songTitle, artistName),
    deezerEnrich(songTitle, artistName),
  ]);

  const allCredits: CreditedPerson[][] = [];
  const sources: SourceStatus[] = [];
  let recordLabel: string | undefined;
  let isrc: string | undefined;
  let iswc: string | undefined;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const val = result.value;
      allCredits.push(val.credits);
      sources.push(val.source);
      if ('label' in val && val.label && !recordLabel) recordLabel = val.label;
      if ('isrc' in val && val.isrc && !isrc) isrc = val.isrc;
      if ('iswc' in val && val.iswc && !iswc) iswc = val.iswc;
    } else {
      // Promise rejected — shouldn't happen since each source catches errors
      console.warn('Source lookup rejected:', result.reason);
    }
  }

  // Add PRO link sources (these are link-only, not API queries)
  sources.push(
    { name: 'ASCAP', status: 'success', recordsFetched: 0, url: proLinks.ascapSearchUrl },
    { name: 'BMI', status: 'success', recordsFetched: 0, url: proLinks.bmiSearchUrl },
    { name: 'MLC', status: 'success', recordsFetched: 0, url: proLinks.mlcSearchUrl },
    { name: 'SoundExchange', status: 'success', recordsFetched: 0, url: proLinks.soundExchangeUrl },
    { name: 'SESAC', status: 'success', recordsFetched: 0, url: proLinks.sesacUrl },
  );

  const mergedCredits = mergeCredits(allCredits);
  const overallConfidence = computeOverallConfidence(mergedCredits, sources);

  return {
    songTitle,
    artistName,
    isrc,
    iswc,
    credits: mergedCredits,
    recordLabel,
    labelType: classifyLabel(recordLabel),
    sources,
    overallConfidence,
    ...proLinks,
  };
}
