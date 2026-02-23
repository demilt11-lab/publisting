import { supabase } from '@/integrations/supabase/client';

export interface CatalogCreditInfo {
  name: string;
  role: 'writer' | 'producer' | 'artist';
  publisher?: string;
  pro?: string;
  ipi?: string;
  share?: number;
}

export interface CatalogSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  url?: string;
  role: string;
  credits?: CatalogCreditInfo[];
  // Enriched fields (populated progressively)
  spotifyStreams?: string | null;
  spotifyStreamCount?: number | null;
  isExactSpotifyCount?: boolean;
  youtubeViews?: string | null;
  publishingShare?: number | null;
}

export interface CatalogData {
  name: string;
  songs: CatalogSong[];
  allCreditNames?: string[];
}

export async function fetchCatalog(name: string, role: string): Promise<CatalogData | null> {
  try {
    const { data, error } = await supabase.functions.invoke('catalog-lookup', {
      body: { name, role },
    });

    if (error) {
      console.error('Catalog lookup error:', error);
      return null;
    }

    if (data?.success) {
      return data.data as CatalogData;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch catalog:', error);
    return null;
  }
}
