import { supabase } from '@/integrations/supabase/client';

export interface SongData {
  title: string;
  artist: string;
  album: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  mbid?: string;
}

export interface CreditData {
  name: string;
  role: 'artist' | 'writer' | 'producer';
  publishingStatus: 'signed' | 'unsigned' | 'unknown';
  publisher?: string;
  ipi?: string;
  pro?: string;
}

export interface SongLookupResult {
  success: boolean;
  error?: string;
  data?: {
    song: SongData;
    credits: CreditData[];
    sources: string[];
  };
}

export async function lookupSong(query: string): Promise<SongLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('song-lookup', {
      body: { query },
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
