import { useState, useRef, useCallback, useEffect } from "react";
import { Credit } from "@/components/CreditsSection";
import { lookupSong, lookupPro, lookupMlcShares, SongData, CreditData, DataSource, DebugSourceInfo, CollectingPublisher } from "@/lib/api/songLookup";
import { REGIONS, getRegionFromPro, getCountryInfo } from "@/components/RegionFilter";
import { useToast } from "@/hooks/use-toast";
import { TrackCredits } from "@/components/BatchCreditsDisplay";
import { useSystemStatus } from "@/contexts/SystemStatusContext";
import { fetchArtistLinks } from "@/lib/api/artistLinksLookup";
import { enrichPerson, linksToSocialMap } from "@/lib/api/peopleEnrichment";

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
      source: c.source,
      region: regionId,
      regionFlag,
      regionLabel,
      socialLinks: c.socialLinks,
      spotifyArtistId: c.spotifyArtistId,
      appleArtistId: c.appleArtistId,
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

    const effectiveLabel = credit.role === 'artist'
      ? (proInfo.recordLabel || credit.recordLabel)
      : credit.recordLabel;
    return {
      ...credit,
      publishingStatus: proInfo.publisher
        ? ("signed" as const)
        : effectiveLabel && credit.role === 'artist'
          ? ("signed" as const)
          : credit.publishingStatus,
      publisher: proInfo.publisher || credit.publisher,
      recordLabel: effectiveLabel,
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
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [proError, setProError] = useState<string | undefined>(undefined);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | undefined>(undefined);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [debugSources, setDebugSources] = useState<DebugSourceInfo | undefined>(undefined);
  const [hasSearched, setHasSearched] = useState(false);
  const [collectingPublishers, setCollectingPublishers] = useState<CollectingPublisher[]>([]);
  const [detectedOrgs, setDetectedOrgs] = useState<string[]>([]);
  const pendingProLookup = useRef<ProLookupInfo | null>(null);
  const searchGeneration = useRef(0);
  const lastFailedSearch = useRef<{ query: string; regions: string[]; onHistoryAdd?: any } | null>(null);
  const inFlightQuery = useRef<string | null>(null);
  const { toast } = useToast();
  const { reportDegraded, clearDegraded } = useSystemStatus();

  // Retry failed search when user returns from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && lastFailedSearch.current && !isLoading) {
        const { query, regions, onHistoryAdd } = lastFailedSearch.current;
        lastFailedSearch.current = null;
        toast({
          title: "Resuming search",
          description: "Retrying search that was interrupted...",
        });
        performSongLookup(query, regions, undefined, onHistoryAdd);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const performSongLookup = useCallback(
    async (
      query: string,
      selectedRegions: string[],
      trackInfo?: { id: string; title: string; artist: string },
      onHistoryAdd?: (entry: { query: string; title: string; artist: string; coverUrl?: string }) => void
    ): Promise<TrackCredits | typeof undefined> => {
      // Request deduplication: skip if same query is already in-flight
      if (inFlightQuery.current === query) return undefined;
      
      const gen = ++searchGeneration.current;
      inFlightQuery.current = query;
      setIsLoading(true);
      if (!trackInfo) {
        setHasSearched(false);
        setProError(undefined);
        pendingProLookup.current = null;
      }

      try {
        const selectedPros = getSelectedPros(selectedRegions);
        const result = await lookupSong(query, selectedPros, true);
        if (gen !== searchGeneration.current) return undefined;

        if (!result.success || !result.data) {
          reportDegraded("song-lookup");
          if (!trackInfo) {
            setHasSearched(true);
            toast({
              title: "Song not found",
              description: result.error || "Could not find publishing information for this song.",
              variant: "destructive",
            });
          }
          lastFailedSearch.current = null;
          return undefined;
        }
        
        // Clear degraded on success
        clearDegraded("song-lookup");

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
              if (gen !== searchGeneration.current) return;
              if (proResult.success && proResult.data) {
                setCredits((prev) => applyProData(prev, proResult.data!));
                if (proResult.searched) setSources(proResult.searched);
                clearDegraded("pro-lookup");
              } else if (proResult.error) {
                setProError(proResult.error);
                reportDegraded("pro-lookup");
              }
            })
            .catch(() => {
              if (gen !== searchGeneration.current) return;
              setProError("PRO lookup failed. Try again.");
              reportDegraded("pro-lookup");
            })
            .finally(() => {
              if (gen !== searchGeneration.current) return;
              setIsLoadingPro(false);
              pendingProLookup.current = null;
            });

          // Phase 3: MLC shares lookup in background
          setIsLoadingShares(true);
          lookupMlcShares(result.data.song.title, result.data.song.artist, creditNames)
            .then((sharesResult) => {
              if (gen !== searchGeneration.current) return;
              if (sharesResult.success && sharesResult.data) {
                // Store collecting publishers
                if (sharesResult.data.collectingPublishers?.length) {
                  setCollectingPublishers(sharesResult.data.collectingPublishers);
                }
                if (sharesResult.detectedOrgs?.length) {
                  setDetectedOrgs(sharesResult.detectedOrgs);
                }

                if (sharesResult.data.shares?.length) {
                  setCredits((prev) => {
                    return prev.map((credit) => {
                      const shareInfo = sharesResult.data!.shares.find(
                        (s) => s.name.toLowerCase() === credit.name.toLowerCase()
                      );
                      if (shareInfo?.share) {
                        return {
                          ...credit,
                          publishingShare: shareInfo.share,
                          shareSource: shareInfo.source || 'MLC',
                          publishingStatus: shareInfo.publisher
                            ? ("signed" as const)
                            : credit.publishingStatus === 'unknown'
                              ? ("signed" as const)
                              : credit.publishingStatus,
                          publisher: shareInfo.publisher || credit.publisher,
                        };
                      }
                      return credit;
                    });
                  });
                }
              }
            })
            .catch((e) => console.error('MLC shares lookup failed:', e))
            .finally(() => {
              if (gen !== searchGeneration.current) return;
              setIsLoadingShares(false);
            });
        }

        // Phase 4: Batch-check people DB + background enrichment
        const uniqueNames = [...new Set(mappedCredits.map(c => c.name))];
        if (uniqueNames.length > 0) {
          const trackUrlForOdesli = typeof query === 'string' && query.startsWith('http') ? query : undefined;
          const enrichSongTitle = result.data.song.title;

          // Step A: Batch-fetch existing links from people DB (instant)
          batchGetPersonLinks(uniqueNames.slice(0, 20)).then((batchResults) => {
            if (gen !== searchGeneration.current) return;

            // Apply any existing DB links immediately
            const existingEnrichments: { name: string; links: Record<string, string> }[] = [];
            const needsEnrichment: { name: string; role: string }[] = [];

            for (const creditName of uniqueNames) {
              const key = creditName.toLowerCase().trim();
              const entry = batchResults[key];
              if (entry && entry.links.length > 0) {
                existingEnrichments.push({ name: creditName, links: linksToSocialMap(entry.links) });
              }
              if (!entry || entry.needsEnrichment) {
                const credit = mappedCredits.find(c => c.name === creditName);
                needsEnrichment.push({ name: creditName, role: credit?.role || 'mixed' });
              }
            }

            // Apply existing links immediately (before enrichment runs)
            if (existingEnrichments.length > 0) {
              setCredits(prev => prev.map(credit => {
                const match = existingEnrichments.find(e => e.name.toLowerCase() === credit.name.toLowerCase());
                if (match) {
                  return { ...credit, socialLinks: { ...match.links, ...credit.socialLinks } };
                }
                return credit;
              }));
            }

            // Step B: Background-enrich stale/missing people (all of them, sequentially in batches of 3)
            if (needsEnrichment.length > 0) {
              const enrichBatch = async (batch: typeof needsEnrichment) => {
                const results = await Promise.allSettled(
                  batch.map(async ({ name: creditName, role: creditRole }) => {
                    const enrichResult = await enrichPerson(creditName, creditRole, trackUrlForOdesli);
                    if (enrichResult && enrichResult.links.length > 0) {
                      return { name: creditName, links: linksToSocialMap(enrichResult.links) };
                    }
                    // Fallback to legacy
                    const links = await fetchArtistLinks(creditName, undefined, enrichSongTitle);
                    return Object.keys(links).length > 0 ? { name: creditName, links } : null;
                  })
                );
                return results
                  .filter((r): r is PromiseFulfilledResult<{ name: string; links: Record<string, string> } | null> =>
                    r.status === 'fulfilled' && r.value !== null
                  )
                  .map(r => r.value!);
              };

              // Process in batches of 3 to respect MusicBrainz rate limits
              (async () => {
                for (let i = 0; i < needsEnrichment.length; i += 3) {
                  if (gen !== searchGeneration.current) return;
                  const batch = needsEnrichment.slice(i, i + 3);
                  const enrichments = await enrichBatch(batch);

                  if (gen !== searchGeneration.current) return;
                  if (enrichments.length > 0) {
                    setCredits(prev => prev.map(credit => {
                      const match = enrichments.find(e => e.name.toLowerCase() === credit.name.toLowerCase());
                      if (match) {
                        return { ...credit, socialLinks: { ...match.links, ...credit.socialLinks } };
                      }
                      return credit;
                    }));
                  }
                }
              })().catch(e => console.warn('Background enrichment failed:', e));
            }
          }).catch(e => console.warn('Batch people lookup failed:', e));
        }

        return undefined;
      } catch (error) {
        console.error("Search error:", error);
        if (!trackInfo) {
          // Store failed search for retry on visibility change (mobile backgrounding)
          lastFailedSearch.current = { query, regions: selectedRegions, onHistoryAdd };
          toast({
            title: "Search interrupted",
            description: "Search will retry when you return to the app.",
            variant: "destructive",
          });
        }
        return undefined;
      } finally {
        inFlightQuery.current = null;
        setIsLoading(false);
      }
    },
    [toast, reportDegraded, clearDegraded]
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

  const cancelSearch = useCallback(() => {
    searchGeneration.current += 1;
    setIsLoading(false);
    setIsLoadingPro(false);
    setIsLoadingShares(false);
    pendingProLookup.current = null;
  }, []);

  const resetResults = useCallback(() => {
    setHasSearched(false);
    setSongData(null);
    setCredits([]);
    setSources([]);
    setDebugSources(undefined);
    setDataSource(undefined);
    setProError(undefined);
    setCollectingPublishers([]);
    setDetectedOrgs([]);
    pendingProLookup.current = null;
  }, []);

  return {
    isLoading,
    isLoadingPro,
    isLoadingShares,
    proError,
    songData,
    dataSource,
    credits,
    sources,
    debugSources,
    hasSearched,
    collectingPublishers,
    detectedOrgs,
    performSongLookup,
    handleRetryPro,
    cancelSearch,
    resetResults,
    setHasSearched,
  };
}
