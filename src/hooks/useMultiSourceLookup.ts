import { useState, useCallback } from 'react';
import { multiSourceSongLookup } from '@/lib/api/multiSourceLookup';
import { MultiSourceResult } from '@/lib/types/multiSource';

export function useMultiSourceLookup() {
  const [multiSourceData, setMultiSourceData] = useState<MultiSourceResult | null>(null);
  const [isLoadingMultiSource, setIsLoadingMultiSource] = useState(false);

  const performMultiSourceLookup = useCallback(async (songTitle: string, artistName: string) => {
    setIsLoadingMultiSource(true);
    try {
      const result = await multiSourceSongLookup(songTitle, artistName);
      setMultiSourceData(result);
      return result;
    } catch (e) {
      console.error('Multi-source lookup failed:', e);
      return null;
    } finally {
      setIsLoadingMultiSource(false);
    }
  }, []);

  const resetMultiSource = useCallback(() => {
    setMultiSourceData(null);
  }, []);

  return {
    multiSourceData,
    isLoadingMultiSource,
    performMultiSourceLookup,
    resetMultiSource,
  };
}
