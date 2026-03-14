export interface CreditedPerson {
  name: string;
  role: string; // 'songwriter' | 'producer' | 'composer' | 'lyricist' | 'arranger' | 'mixer' | 'engineer' | 'featuring' | 'artist' | 'writer'
  pro?: string;
  publishingCompany?: string;
  publishingType?: 'major' | 'indie' | 'unknown';
  recordLabel?: string;
  labelType?: 'major' | 'indie' | 'unknown';
  ipi?: string;
  confidence: number; // 0-1
  sources: string[];
  spotifyArtistId?: string;
  mbid?: string;
}

export interface MultiSourceResult {
  songTitle: string;
  artistName: string;
  isrc?: string;
  iswc?: string;
  iswcList?: string[];
  credits: CreditedPerson[];
  recordLabel?: string;
  labelType?: 'major' | 'indie' | 'unknown';
  publishingAdmin?: string;
  sources: SourceStatus[];
  overallConfidence: number;
  ascapSearchUrl?: string;
  bmiSearchUrl?: string;
  mlcSearchUrl?: string;
  soundExchangeUrl?: string;
  sesacUrl?: string;
  gmrUrl?: string;
}

export interface SourceStatus {
  name: string;
  status: 'success' | 'partial' | 'failed' | 'no_data';
  recordsFetched: number;
  url?: string;
}
