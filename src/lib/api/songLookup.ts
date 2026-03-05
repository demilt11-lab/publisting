import { supabase } from '@/integrations/supabase/client';

export interface SongData {
  title: string;
  artist: string;
  album: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  mbid?: string;
  recordLabel?: string | null;
  isrc?: string | null;
}

export interface CreditData {
  name: string;
  role: 'artist' | 'writer' | 'producer';
  publishingStatus: 'signed' | 'unsigned' | 'unknown';
  publisher?: string;
  recordLabel?: string;
  management?: string;
  ipi?: string;
  pro?: string;
  source?: string; // e.g. "Genius", "Discogs", "MusicBrainz", "Apple Music", "Spotify"
  // Location (primarily for artists)
  locationCountry?: string; // e.g. "US", "GB"
  locationName?: string; // e.g. "Los Angeles", "London"
}

export type DataSource = 'isrc' | 'musicbrainz' | 'odesli';

export interface DebugSourceInfo {
  musicbrainz?: { artists: string[]; writers: string[]; producers: string[] };
  genius?: { writers: string[]; producers: string[] };
  discogs?: { writers: string[]; producers: string[] };
  apple?: { writers: string[]; producers: string[] };
  spotify?: { writers: string[]; producers: string[] };
}

export interface SongLookupResult {
  success: boolean;
  error?: string;
  data?: {
    song: SongData;
    credits: CreditData[];
    sources: string[];
    dataSource?: DataSource;
    debugSources?: DebugSourceInfo;
    creditNames?: string[];
  };
}

export interface ProLookupResult {
  success: boolean;
  error?: string;
  data?: Record<string, {
    name: string;
    ipi?: string;
    publisher?: string;
    recordLabel?: string;
    management?: string;
    pro?: string;
    locationCountry?: string;
    locationName?: string;
  }>;
  searched?: string[];
}

export interface MlcSharesResult {
  success: boolean;
  error?: string;
  data?: {
    workTitle?: string;
    totalClaimedShares?: number;
    shares: { name: string; share?: number; source?: string; publisher?: string }[];
  };
  sources?: string[];
}

export async function lookupSong(query: string, filterPros?: string[], skipPro?: boolean): Promise<SongLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('song-lookup', {
      body: { query, filterPros, skipPro },
    });

    if (error) {
      console.error('Song lookup error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to lookup song' 
      };
    }

    return data as SongLookupResult;
  } catch (error) {
    console.error('Song lookup exception:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to lookup song' 
    };
  }
}

export async function lookupPro(names: string[], songTitle?: string, artist?: string, filterPros?: string[]): Promise<ProLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('pro-lookup', {
      body: { names, songTitle, artist, filterPros },
    });

    if (error) {
      console.error('PRO lookup error:', error);
      return { success: false, error: error.message || 'Failed to lookup PRO info' };
    }

    return data as ProLookupResult;
  } catch (error) {
    console.error('PRO lookup exception:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to lookup PRO info' 
    };
  }
}

export async function lookupMlcShares(songTitle: string, artist: string, writerNames: string[]): Promise<MlcSharesResult> {
  try {
    const { data, error } = await supabase.functions.invoke('mlc-shares-lookup', {
      body: { songTitle, artist, writerNames },
    });

    if (error) {
      console.error('MLC shares lookup error:', error);
      return { success: false, error: error.message || 'Failed to lookup shares' };
    }

    return data as MlcSharesResult;
  } catch (error) {
    console.error('MLC shares lookup exception:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to lookup shares' 
    };
  }
}
