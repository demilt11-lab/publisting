import { supabase } from '@/integrations/supabase/client';

export interface CatalogSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  url?: string;
  role: string;
  // Enriched fields (populated progressively)
  spotifyStreams?: string | null;
  youtubeViews?: string | null;
  publishingShare?: number | null;
}

export interface CatalogData {
  name: string;
  songs: CatalogSong[];
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
