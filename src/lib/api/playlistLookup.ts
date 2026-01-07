import { supabase } from '@/integrations/supabase/client';

export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  trackNumber: number;
  duration?: string;
  albumName?: string;
  coverUrl?: string;
}

export interface PlaylistInfo {
  name: string;
  creator: string;
  description?: string;
  coverUrl?: string;
  tracks: PlaylistTrack[];
  platform: string;
  totalTracks: number;
}

export interface PlaylistLookupResult {
  success: boolean;
  isPlaylist: boolean;
  error?: string;
  playlist?: PlaylistInfo;
  hasFullTrackList?: boolean;
  message?: string;
}

export async function checkForPlaylist(query: string): Promise<PlaylistLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('playlist-lookup', {
      body: { query },
    });

    if (error) {
      console.error('Playlist lookup error:', error);
      return { 
        success: false, 
        isPlaylist: false,
        error: error.message || 'Failed to check for playlist' 
      };
    }

    return data as PlaylistLookupResult;
  } catch (error) {
    console.error('Playlist lookup exception:', error);
    return { 
      success: false, 
      isPlaylist: false,
      error: error instanceof Error ? error.message : 'Failed to check for playlist' 
    };
  }
}
