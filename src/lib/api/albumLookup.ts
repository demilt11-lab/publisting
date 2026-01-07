import { supabase } from '@/integrations/supabase/client';
import { AlbumInfo, AlbumTrack } from '@/components/AlbumTrackSelector';

export interface AlbumLookupResult {
  success: boolean;
  isAlbum: boolean;
  error?: string;
  album?: AlbumInfo;
}

export async function checkForAlbum(query: string): Promise<AlbumLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('album-lookup', {
      body: { query },
    });

    if (error) {
      console.error('Album lookup error:', error);
      return { 
        success: false, 
        isAlbum: false,
        error: error.message || 'Failed to check for album' 
      };
    }

    return data as AlbumLookupResult;
  } catch (error) {
    console.error('Album lookup exception:', error);
    return { 
      success: false, 
      isAlbum: false,
      error: error instanceof Error ? error.message : 'Failed to check for album' 
    };
  }
}
