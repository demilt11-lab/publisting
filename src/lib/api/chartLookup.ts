import { supabase } from '@/integrations/supabase/client';

export interface ChartPlacement {
  chart: string; // e.g. "Billboard Hot 100", "Spotify Top 50"
  peakPosition?: number;
  currentPosition?: number;
  weeksOnChart?: number;
  date?: string;
  source?: string;
}

export interface ChartLookupResult {
  success: boolean;
  error?: string;
  data?: {
    songTitle: string;
    artist: string;
    placements: ChartPlacement[];
  };
}

export async function lookupChartPlacements(songTitle: string, artist: string): Promise<ChartLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('chart-lookup', {
      body: { songTitle, artist },
    });

    if (error) {
      console.error('Chart lookup error:', error);
      return { success: false, error: error.message || 'Failed to lookup chart data' };
    }

    return data as ChartLookupResult;
  } catch (error) {
    console.error('Chart lookup exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to lookup chart data',
    };
  }
}
