import { supabase } from '@/integrations/supabase/client';

export interface StreamingStats {
  spotify: {
    popularity: number | null;
    streamCount: number | null;
    isExactStreamCount: boolean;
    estimatedStreams: number | null;
    url: string | null;
  };
  youtube: {
    viewCount: string | null;
    url: string | null;
  };
  genius: {
    pageviews: number | null;
    url: string | null;
  };
  shazam: {
    count: number | null;
    url: string | null;
  };
}

export async function fetchStreamingStats(
  title: string,
  artist: string,
  spotifyTrackId?: string
): Promise<StreamingStats | null> {
  try {
    const { data, error } = await supabase.functions.invoke('streaming-stats', {
      body: { title, artist, spotifyTrackId },
    });

    if (error) {
      console.error('Streaming stats error:', error);
      return null;
    }

    if (data?.success) {
      return data.data as StreamingStats;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch streaming stats:', error);
    return null;
  }
}
