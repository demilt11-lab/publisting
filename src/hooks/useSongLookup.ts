import { useState, useRef, useCallback } from "react";
import { Credit } from "@/components/CreditsSection";
import { lookupSong, lookupPro, SongData, CreditData, DataSource, DebugSourceInfo } from "@/lib/api/songLookup";
import { REGIONS, getRegionFromPro, getCountryInfo } from "@/components/RegionFilter";
import { useToast } from "@/hooks/use-toast";
import { TrackCredits } from "@/components/BatchCreditsDisplay";

interface ProLookupInfo {
  names: string[];
  songTitle?: string;
  artist?: string;
}

function mapCredits(creditsData: CreditData[]): Credit[] {
  return creditsData.map((c) => {
    let regionFlag: string | undefined;
    let regionLabel: string | undefined;
    let regionId: string | undefined;

    if (c.locationCountry) {
      const countryInfo = getCountryInfo(c.locationCountry);
      if (countryInfo) {
        regionFlag = countryInfo.flag;
        regionLabel = c.locationName || countryInfo.label;
        regionId = c.locationCountry;
      }
    } else if (c.pro) {
      const region = getRegionFromPro(c.pro);
      if (region) {
        regionFlag = region.flag;
        regionLabel = region.label;
        regionId = region.id;
      }
    }

    return {
      name: c.name,
      role: c.role,
      publishingStatus: c.publishingStatus,
      publisher: c.publisher,
      recordLabel: c.recordLabel,
      management: c.management,
      ipi: c.ipi,
      pro: c.pro,
      region: regionId,
      regionFlag,
      regionLabel,
    };
  });
}

function applyProData(credits: Credit[], proData: Record<string, any>): Credit[] {
  return credits.map((credit) => {
    const proInfo = proData[credit.name];
    if (!proInfo) return credit;

    let regionFlag = credit.regionFlag;
    let regionLabel = credit.regionLabel;
    let regionId = credit.region;

    if (proInfo.locationCountry) {
      const countryInfo = getCountryInfo(proInfo.locationCountry);
      if (countryInfo) {
        regionFlag = countryInfo.flag;
        regionLabel = proInfo.locationName || countryInfo.label;
        regionId = proInfo.locationCountry;
      }
    } else if (proInfo.pro && !regionFlag) {
      const region = getRegionFromPro(proInfo.pro);
      if (region) {
        regionFlag = region.flag;
        regionLabel = region.label;
        regionId = region.id;
      }
    }

    return {
      ...credit,
      publishingStatus: proInfo.publisher
        ? ("signed" as const)
        : proInfo.pro || proInfo.ipi
          ? ("signed" as const)
          : credit.publishingStatus,
      publisher: proInfo.publisher || credit.publisher,
      recordLabel: proInfo.recordLabel || credit.recordLabel,
      management: proInfo.management || credit.management,
      ipi: proInfo.ipi || credit.ipi,
      pro: proInfo.pro || credit.pro,
      region: regionId,
      regionFlag,
      regionLabel,
    };
  });
}

function getSelectedPros(selectedRegions: string[]): string[] {
  return selectedRegions.length === REGIONS.length
    ? []
    : REGIONS.filter((r) => selectedRegions.includes(r.id)).flatMap((r) => r.pros);
}

export function useSongLookup() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPro, setIsLoadingPro] = useState(false);
  const [proError, setProError] = useState<string | undefined>(undefined);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | undefined>(undefined);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [debugSources, setDebugSources] = useState<DebugSourceInfo | undefined>(undefined);
  const [hasSearched, setHasSearched] = useState(false);

  const pendingProLookup = useRef<ProLookupInfo | null>(null);
  const { toast } = useToast();

  const performSongLookup = useCallback(
    async (
      query: string,
      selectedRegions: string[],
      trackInfo?: { id: string; title: string; artist: string },
      onHistoryAdd?: (entry: { query: string; title: string; artist: string; coverUrl?: string }) => void
    ): Promise<TrackCredits | typeof undefined> => {
      setIsLoading(true);
      if (!trackInfo) {
        setHasSearched(false);
        setProError(undefined);
        pendingProLookup.current = null;
      }

      try {
        const selectedPros = getSelectedPros(selectedRegions);
        const result = await lookupSong(query, selectedPros, true);

        if (!result.success || !result.data) {
          if (!trackInfo) {
            toast({
              title: "Song not found",
              description: result.error || "Could not find publishing information for this song.",
              variant: "destructive",
            });
          }
          return undefined;
        }

        if (trackInfo) {
          return {
            trackId: trackInfo.id,
            trackTitle: trackInfo.title,
            trackArtist: trackInfo.artist,
            credits: mapCredits(result.data.credits),
            sources: result.data.sources,
          } as TrackCredits;
        }

        const mappedCredits = mapCredits(result.data.credits);
        setSongData(result.data.song);
        setSources(result.data.sources);
        setCredits(mappedCredits);
        setDataSource(result.data.dataSource);
        setDebugSources(result.data.debugSources);
        setHasSearched(true);

        onHistoryAdd?.({
          query,
          title: result.data.song.title,
          artist: result.data.song.artist,
          coverUrl: result.data.song.coverUrl || undefined,
        });

        // Phase 2: PRO lookup in background
        const creditNames = result.data.creditNames;
        if (creditNames && creditNames.length > 0) {
          pendingProLookup.current = {
            names: creditNames,
            songTitle: result.data.song.title,
            artist: result.data.song.artist,
          };
          setIsLoadingPro(true);

          lookupPro(creditNames, result.data.song.title, result.data.song.artist, selectedPros)
            .then((proResult) => {
              if (proResult.success && proResult.data) {
                setCredits((prev) => applyProData(prev, proResult.data!));
                if (proResult.searched) setSources(proResult.searched);
              } else if (proResult.error) {
                setProError(proResult.error);
              }
            })
            .catch(() => setProError("PRO lookup failed. Try again."))
            .finally(() => {
              setIsLoadingPro(false);
              pendingProLookup.current = null;
            });
        }

        return undefined;
      } catch (error) {
        console.error("Search error:", error);
        if (!trackInfo) {
          toast({
            title: "Error",
            description: "Failed to search. Please try again.",
            variant: "destructive",
          });
        }
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const handleRetryPro = useCallback(
    (selectedRegions: string[]) => {
      if (pendingProLookup.current || credits.length === 0) return;
      const names = [...new Set(credits.map((c) => c.name))];
      const selectedPros = getSelectedPros(selectedRegions);

      setProError(undefined);
      setIsLoadingPro(true);

      lookupPro(names, songData?.title, songData?.artist, selectedPros)
        .then((proResult) => {
          if (proResult.success && proResult.data) {
            setCredits((prev) => applyProData(prev, proResult.data!));
            if (proResult.searched) setSources(proResult.searched);
          } else if (proResult.error) {
            setProError(proResult.error);
          }
        })
        .catch(() => setProError("PRO lookup failed. Try again."))
        .finally(() => setIsLoadingPro(false));
    },
    [credits, songData]
  );

  const resetResults = useCallback(() => {
    setHasSearched(false);
    setSongData(null);
    setCredits([]);
    setSources([]);
    setDebugSources(undefined);
    setDataSource(undefined);
    setProError(undefined);
    pendingProLookup.current = null;
  }, []);

  return {
    isLoading,
    isLoadingPro,
    proError,
    songData,
    dataSource,
    credits,
    sources,
    debugSources,
    hasSearched,
    performSongLookup,
    handleRetryPro,
    resetResults,
    setHasSearched,
  };
}
