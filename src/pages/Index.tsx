import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Disc3, RefreshCw, RotateCcw, ArrowLeft, Search, Music, RotateCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSongLookup } from "@/hooks/useSongLookup";
import { useMultiSourceLookup } from "@/hooks/useMultiSourceLookup";
import { useProjects } from "@/hooks/useProjects";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useLocalBackup } from "@/hooks/useLocalBackup";
import { useIsMobile } from "@/hooks/use-mobile";

import { AppShell, NavSection } from "@/components/layout/AppShell";
import { SongProfilePanel, SongProfilePanelHandle } from "@/components/layout/SongProfilePanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { SearchBar } from "@/components/SearchBar";
import { SongCardSkeleton } from "@/components/SongCardSkeleton";
import { BackToTop } from "@/components/BackToTop";
import { DealsTracker, useDeals } from "@/components/DealsTracker";
import { ArtistProfile } from "@/components/ArtistProfile";
import { ComparePanel, CompareSong } from "@/components/ComparePanel";
import { REGIONS } from "@/components/RegionFilter";
import { AlbumTrackSelector, AlbumInfo, AlbumTrack } from "@/components/AlbumTrackSelector";
import { PlaylistTrackSelector } from "@/components/PlaylistTrackSelector";
import { BatchCreditsDisplay, TrackCredits } from "@/components/BatchCreditsDisplay";
import { PlaylistTrack } from "@/lib/api/playlistLookup";
import { TeamPanel } from "@/components/TeamPanel";
import { ChartBadges } from "@/components/ChartPlacements";
import { CatalogSheet } from "@/components/CatalogSheet";
import { CommandPalette } from "@/components/CommandPalette";
import { EMPTY_FILTERS, SearchFilters } from "@/components/AdvancedFilters";
import { SearchHistoryTab } from "@/components/SearchHistoryTab";
import { OnboardingTour } from "@/components/OnboardingTour";
import { HowToTab } from "@/components/HowToTab";
import { HowToPage } from "@/components/HowToPage";
import { TeamsPage } from "@/components/TeamsPage";
import { WatchlistView } from "@/components/WatchlistView";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { checkForAlbum } from "@/lib/api/albumLookup";
import { checkForPlaylist, PlaylistInfo } from "@/lib/api/playlistLookup";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuickGuide } from "@/components/QuickGuide";
import { TrendingSongs } from "@/components/TrendingSongs";
import { Badge } from "@/components/ui/badge";
import { SongRecommendations } from "@/components/SongRecommendations";

const LOADING_MESSAGES = [
  "Searching MusicBrainz database...",
  "Looking up publishing rights...",
  "Checking PRO registries...",
  "Fetching streaming stats...",
  "Querying Discogs credits...",
  "Searching iTunes catalog...",
  "Enriching via Deezer...",
  "Cross-referencing ASCAP, BMI, MLC...",
];

const SLOW_SEARCH_THRESHOLD = 15000;

const QUICK_SEARCHES = [
  { title: "Snooze", artist: "SZA" },
  { title: "Kill Bill", artist: "SZA" },
  { title: "Cruel Summer", artist: "Taylor Swift" },
  { title: "Blinding Lights", artist: "The Weeknd" },
];

const Index = () => {
  const [activeSection, setActiveSection] = useState<NavSection>("home");
  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(REGIONS.map((r) => r.id));
  const [albumData, setAlbumData] = useState<AlbumInfo | null>(null);
  const [playlistData, setPlaylistData] = useState<PlaylistInfo | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | undefined>();
  const [completedTrackIds, setCompletedTrackIds] = useState<string[]>([]);
  const [batchCredits, setBatchCredits] = useState<TrackCredits[]>([]);
  const [showBatchResults, setShowBatchResults] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>("");
  const [sharecopied, setShareCopied] = useState(false);
  const [chartPlacements, setChartPlacements] = useState<ChartPlacement[]>([]);
  const [catalogTarget, setCatalogTarget] = useState<{ name: string; role: string } | null>(null);
  const [compareSongs, setCompareSongs] = useState<CompareSong[]>([]);
  const [artistProfile, setArtistProfile] = useState<{ name: string; coverUrl?: string } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showGuide, setShowGuide] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [watchlistDrawerOpen, setWatchlistDrawerOpen] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songPanelRef = useRef<SongProfilePanelHandle>(null);

  const { projects } = useProjects();
  const { watchlist } = useWatchlist();
  const isMobile = useIsMobile();

  const hasAutoSearched = useRef(false);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { deals, addDeal, updateDeal, removeDeal } = useDeals();
  const { history, addEntry, clearHistory, removeEntry, togglePin, updateEntryCredits } = useSearchHistory();
  useLocalBackup();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    isLoading, isLoadingPro, isLoadingShares, proError,
    songData, dataSource, credits, sources, debugSources, hasSearched,
    collectingPublishers, detectedOrgs,
    performSongLookup, handleRetryPro, cancelSearch, resetResults,
  } = useSongLookup();

  const { multiSourceData, isLoadingMultiSource, performMultiSourceLookup, resetMultiSource } = useMultiSourceLookup();

  // Trigger multi-source lookup when song data is available
  useEffect(() => {
    if (songData?.title && songData?.artist && hasSearched) {
      performMultiSourceLookup(songData.title, songData.artist);
    }
  }, [songData?.title, songData?.artist, hasSearched, performMultiSourceLookup]);

  // Loading message rotation + slow search detection
  useEffect(() => {
    if (!isLoading) {
      setShowSlowMessage(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    slowTimerRef.current = setTimeout(() => setShowSlowMessage(true), SLOW_SEARCH_THRESHOLD);
    return () => {
      clearInterval(interval);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [isLoading]);

  // Auto-search from URL ?q= parameter
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      handleSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasSearched && lastSearchQuery) {
      setSearchParams({ q: lastSearchQuery }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSearched, lastSearchQuery]);

  useEffect(() => {
    if (hasSearched && credits.length > 0 && lastSearchQuery) {
      const signed = credits.filter((c) => c.publishingStatus === "signed").length;
      updateEntryCredits(lastSearchQuery, signed, credits.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, hasSearched]);

  // Keyboard shortcuts
  const TAB_KEYS = ["summary", "credits", "exposure", "contacts", "pipeline"];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if (e.key >= "1" && e.key <= "5" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tabIdx = parseInt(e.key) - 1;
        if (TAB_KEYS[tabIdx] && songPanelRef.current) {
          songPanelRef.current.setActiveTab(TAB_KEYS[tabIdx]);
        }
        return;
      }
      switch (e.key) {
        case "/":
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Paste"]');
          searchInput?.focus();
          break;
        case "w":
        case "W":
          setWatchlistDrawerOpen((v) => !v);
          break;
        default:
          switch (e.key.toLowerCase()) {
            case "h":
              setActiveSection((s) => (s === "history" ? "home" : "history"));
              break;
            case "escape":
              setShowTeams(false);
              setWatchlistDrawerOpen(false);
              break;
          }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [user]);

  const handleSearch = useCallback(
    async (query: string) => {
      setActiveSection("home");
      setIsCheckingLink(true);
      setAlbumData(null);
      setPlaylistData(null);
      setShowBatchResults(false);
      setBatchCredits([]);
      setCompletedTrackIds([]);
      setLastSearchQuery(query);

      try {
        const playlistResult = await checkForPlaylist(query);
        if (playlistResult.isPlaylist && playlistResult.playlist) {
          if (playlistResult.playlist.tracks.length > 0) {
            setPlaylistData(playlistResult.playlist);
            setIsCheckingLink(false);
            return;
          } else {
            toast({ title: "Playlist detected", description: playlistResult.message || "Track listing not available.", variant: "default" });
            setIsCheckingLink(false);
            return;
          }
        }
        const albumResult = await checkForAlbum(query);
        if (albumResult.isAlbum && albumResult.album) {
          if (albumResult.album.tracks.length > 0) {
            setAlbumData(albumResult.album);
            setIsCheckingLink(false);
            return;
          } else {
            toast({ title: "Album detected", description: "Track listing not available for this platform.", variant: "default" });
            setIsCheckingLink(false);
            return;
          }
        }
      } catch (err) {
        console.error("Link check failed:", err);
        toast({ title: "Link check failed", description: "Could not determine link type. Searching as text instead.", variant: "default" });
        setIsCheckingLink(false);
        // Fall through to text search instead of silently returning
      }

      setIsCheckingLink(false);
      await performSongLookup(query, selectedRegions, undefined, addEntry);
    },
    [performSongLookup, selectedRegions, addEntry, toast]
  );

  const handleNewSearch = useCallback(() => {
    cancelSearch();
    resetResults();
    resetMultiSource();
    setLastSearchQuery("");
    setSearchParams({}, { replace: true });
  }, [cancelSearch, resetResults, resetMultiSource, setSearchParams]);

  const handleTrackSelect = useCallback(
    async (track: AlbumTrack | PlaylistTrack) => {
      setLoadingTrackId(track.id);
      const searchQuery = `${track.artist} - ${track.title}`;
      await performSongLookup(searchQuery, selectedRegions);
      setAlbumData(null);
      setPlaylistData(null);
      setLoadingTrackId(undefined);
    },
    [performSongLookup, selectedRegions]
  );

  const runBatchLookup = async (tracks: { id: string; title: string; artist: string }[], onDone: () => void) => {
    const results: TrackCredits[] = [];
    const completed: string[] = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < tracks.length; i += CONCURRENCY) {
      const batch = tracks.slice(i, i + CONCURRENCY);
      setLoadingTrackId(batch[0].id);
      const batchResults = await Promise.allSettled(
        batch.map((track) => performSongLookup(`${track.artist} - ${track.title}`, selectedRegions, { id: track.id, title: track.title, artist: track.artist }))
      );
      batchResults.forEach((settled, idx) => {
        if (settled.status === "fulfilled" && settled.value) results.push(settled.value as TrackCredits);
        completed.push(batch[idx].id);
      });
      setCompletedTrackIds([...completed]);
      setBatchCredits([...results]);
    }
    setLoadingTrackId(undefined);
    if (results.length > 0) {
      setShowBatchResults(true);
      onDone();
      toast({ title: "Batch lookup complete", description: `Found credits for ${results.length} of ${tracks.length} tracks.` });
    }
  };

  const handleAlbumBatchLookup = (tracks: AlbumTrack[]) => runBatchLookup(tracks, () => setAlbumData(null));
  const handleBatchLookup = (tracks: PlaylistTrack[]) => runBatchLookup(tracks, () => setPlaylistData(null));
  const handleCancelSelection = useCallback(() => {
    setAlbumData(null);
    setPlaylistData(null);
    setCompletedTrackIds([]);
  }, []);
  const handleCloseBatchResults = useCallback(() => {
    setShowBatchResults(false);
    setBatchCredits([]);
    setCompletedTrackIds([]);
  }, []);

  const handleAddToCompare = useCallback(
    (title: string, artist: string) => {
      setCompareSongs((prev) => {
        if (prev.length >= 3) {
          toast({ title: "Compare limit", description: "Max 3 songs." });
          return prev;
        }
        if (prev.some((s) => s.title === title && s.artist === artist)) {
          toast({ title: "Already added" });
          return prev;
        }
        toast({ title: `Added to Compare (${prev.length + 1}/3)` });
        return [...prev, { title, artist, credits }];
      });
    },
    [credits, toast]
  );

  const songProjectData = useMemo(() => {
    if (!songData || credits.length === 0) return null;
    const writers = credits.filter((c) => c.role === "writer");
    const publishers = new Set(credits.filter((c) => c.publisher).map((c) => c.publisher));
    const majorPubs = ["sony", "universal", "warner", "bmg", "kobalt"];
    const pubList = Array.from(publishers);
    const majorCount = pubList.filter((p) => majorPubs.some((m) => p!.toLowerCase().includes(m))).length;
    const publishingMix = majorCount === 0 ? "indie" : majorCount === pubList.length ? "major" : "mixed";
    const majorLabels = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];
    const labelType = songData.recordLabel && majorLabels.some((m) => songData.recordLabel!.toLowerCase().includes(m)) ? "major" : "indie";
    const signedRatio = credits.filter((c) => c.publisher).length / credits.length;
    const signingStatus = signedRatio >= 0.8 ? "high" : signedRatio >= 0.5 ? "medium" : "low";
    const topPublishers = pubList.filter(Boolean).slice(0, 3) as string[];
    return {
      title: songData.title,
      artist: songData.artist,
      coverUrl: songData.coverUrl || undefined,
      writersCount: writers.length,
      publishersCount: publishers.size,
      publishingMix: publishingMix as "indie" | "mixed" | "major",
      labelType: labelType as "indie" | "major",
      signingStatus: signingStatus as "high" | "medium" | "low",
      recordLabel: songData.recordLabel || undefined,
      topPublishers,
    };
  }, [songData, credits]);

  const recentSearches = history.slice(0, 5).map((h) => ({ query: h.query, title: h.title, artist: h.artist }));
  const showingResults = hasSearched && !isLoading && !albumData && !playlistData && !showBatchResults && songData;

  const handleSectionChange = (section: NavSection) => {
    setActiveSection(section);
    setShowTeams(false);
    // If navigating to watchlist section, close the drawer
    if (section === "watchlist") {
      setWatchlistDrawerOpen(false);
    }
    // Reset song results when going home so the search screen is shown
    if (section === "home") {
      resetResults();
      setAlbumData(null);
      setPlaylistData(null);
      setShowBatchResults(false);
      setBatchCredits([]);
      setChartPlacements([]);
      setLastSearchQuery("");
    }
  };

  const recentSearchCards = history.slice(0, 8).map((h) => ({
    query: h.query,
    title: h.title,
    artist: h.artist,
    coverUrl: h.coverUrl,
    signedCount: h.signedCount,
    totalCount: h.totalCount,
    signingStatus:
      h.signedCount && h.totalCount && h.signedCount / h.totalCount >= 0.8
        ? ("high" as const)
        : h.signedCount && h.totalCount && h.signedCount / h.totalCount >= 0.5
        ? ("medium" as const)
        : ("low" as const),
  }));

  // ─── Render the center content ───
  const renderCenterContent = () => {
    if (showTeams && user) {
      return (
        <div className="p-6">
          <TeamPanel onClose={() => setShowTeams(false)} />
        </div>
      );
    }
    if (showBatchResults && batchCredits.length > 0) {
      return (
        <div className="p-6">
          <BatchCreditsDisplay tracksCredits={batchCredits} onClose={handleCloseBatchResults} />
        </div>
      );
    }

    switch (activeSection) {
      case "history":
        return (
          <div className="p-6">
            <SearchHistoryTab history={history} onSearch={handleSearch} onRemove={removeEntry} onClear={clearHistory} onClose={() => setActiveSection("home")} />
          </div>
        );
      case "teams":
        return (
          <div className="p-6">
            <TeamsPage
              onClose={() => setActiveSection("home")}
              onNavigateToPipeline={(userId) => {
                setActiveSection("home");
              }}
            />
          </div>
        );
      case "watchlist":
        return (
          <div className="p-6 h-full">
            <WatchlistView onClose={() => setActiveSection("home")} onSearchSong={handleSearch} onViewCatalog={(name, role) => setCatalogTarget({ name, role })} fullScreen />
          </div>
        );
      case "howto":
        return (
          <div className="p-6">
            <HowToPage onClose={() => setActiveSection("home")} />
          </div>
        );
      case "settings":
        return (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <div className="space-y-4">
              {user && (
                <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={signOut}>
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      default:
        // ─── HOME: search + song detail in center ───
        return (
          <div className="h-full flex flex-col">
            {/* Persistent search bar at top */}
            <div className="px-6 py-5 border-b border-border/50 shrink-0">
              {!showingResults && (
                <div className="text-center mb-4">
                  <h1 className="text-xl font-bold text-foreground">Search any song to discover full credits and publishing affiliates</h1>
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg mx-auto">
                    Publisting shows who wrote and produced a song, who they're signed to, and how the track is performing across charts, playlists, and radio.
                  </p>
                </div>
              )}
              <div className="max-w-2xl mx-auto w-full flex items-center gap-2">
                <div className="flex-1">
                  <SearchBar
                    onSearch={handleSearch}
                    onCancel={() => {
                      cancelSearch();
                      setIsCheckingLink(false);
                    }}
                    isLoading={isLoading || isCheckingLink}
                    recentSearches={recentSearches}
                  />
                </div>
                {showingResults && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0 hover:text-foreground" onClick={handleNewSearch}>
                    New search
                  </Button>
                )}
              </div>
              {/* Filters placeholder removed — dead code cleaned up */}
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-auto">
              {catalogTarget && (
                <div className="p-6 h-full">
                  <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
                </div>
              )}

              {showingResults && !catalogTarget && (
                <ErrorBoundary fallbackTitle="Song results failed to load" onReset={handleNewSearch}>
                  <div className="animate-fade-in">
                    <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />
                    <SongProfilePanel
                      ref={songPanelRef}
                      songData={{
                        title: songData.title,
                        artist: songData.artist,
                        album: songData.album || undefined,
                        coverUrl: songData.coverUrl || undefined,
                        recordLabel: songData.recordLabel || undefined,
                        isrc: songData.isrc || undefined,
                        releaseDate: songData.releaseDate || undefined,
                      }}
                      credits={credits}
                      chartPlacements={chartPlacements}
                      isLoadingPro={isLoadingPro}
                      isLoadingShares={isLoadingShares}
                      proError={proError}
                      onRetryPro={() => handleRetryPro(selectedRegions)}
                      onViewCatalog={(name, role) => setCatalogTarget({ name, role })}
                      onClose={handleNewSearch}
                      songProjectData={songProjectData}
                      multiSourceData={multiSourceData}
                      isLoadingMultiSource={isLoadingMultiSource}
                      collectingPublishers={collectingPublishers}
                      detectedOrgs={detectedOrgs}
                    />
                  </div>
                </ErrorBoundary>
              )}

              {playlistData && !isLoading && !showBatchResults && (
                <div className="p-6">
                  <ErrorBoundary fallbackTitle="Playlist selector failed" onReset={handleCancelSelection} compact>
                    <PlaylistTrackSelector playlist={playlistData} onSelectTrack={handleTrackSelect} onBatchLookup={handleBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
                  </ErrorBoundary>
                </div>
              )}
              {albumData && !showBatchResults && (
                <div className="p-6">
                  <ErrorBoundary fallbackTitle="Album selector failed" onReset={handleCancelSelection} compact>
                    <AlbumTrackSelector album={albumData} onSelectTrack={handleTrackSelect} onBatchLookup={handleAlbumBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
                  </ErrorBoundary>
                </div>
              )}

              {isLoading && !playlistData && (
                <div className="p-6 space-y-4">
                  <SongCardSkeleton />
                  <div className="w-full max-w-md mx-auto">
                    <div className="h-1 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-loading-bar" />
                    </div>
                  </div>
                  <p className="text-center text-sm text-muted-foreground animate-pulse" key={loadingMsgIdx}>
                    {LOADING_MESSAGES[loadingMsgIdx]}
                  </p>
                  {showSlowMessage && <p className="text-center text-xs text-muted-foreground/70 animate-fade-in">Still searching… this may take a moment for international tracks.</p>}
                </div>
              )}

              {isCheckingLink && (
                <div className="p-6">
                  <div className="rounded-2xl border border-border/50 bg-card p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                      <Disc3 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                    <p className="text-muted-foreground">Checking link type...</p>
                  </div>
                </div>
              )}

              {hasSearched && !isLoading && !songData && !albumData && !playlistData && (
                <div className="p-6 max-w-2xl mx-auto">
                  <div className="rounded-2xl border border-border/50 bg-card p-8 sm:p-12 text-center space-y-5">
                    <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                      <Search className="w-7 h-7 text-destructive" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-foreground">Song not found</h3>
                      <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                        We couldn't find credits for "<span className="text-foreground font-medium">{lastSearchQuery}</span>".
                        This can happen with very new releases, obscure indie tracks, or misspelled queries.
                      </p>
                    </div>

                    {/* Tips */}
                    <div className="bg-secondary/50 rounded-xl p-4 text-left space-y-2 max-w-sm mx-auto">
                      <p className="text-xs font-medium text-foreground uppercase tracking-wider">Tips to improve results</p>
                      <ul className="text-xs text-muted-foreground space-y-1.5 list-none">
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>Use the format <code className="px-1.5 py-0.5 rounded bg-background border border-border/50 text-foreground">Artist – Song Title</code></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>Check spelling of artist and song name</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>Paste a <code className="px-1.5 py-0.5 rounded bg-background border border-border/50 text-foreground">Spotify</code> or <code className="px-1.5 py-0.5 rounded bg-background border border-border/50 text-foreground">Apple Music</code> link for exact match</span>
                        </li>
                      </ul>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                      <Button variant="default" size="sm" onClick={() => handleSearch(lastSearchQuery)} className="gap-2">
                        <RefreshCw className="w-4 h-4" /> Retry Search
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleNewSearch} className="gap-2">
                        <RotateCcw className="w-4 h-4" /> New Search
                      </Button>
                    </div>

                    {/* Quick suggestions */}
                    <div className="border-t border-border/50 pt-4 space-y-2.5">
                      <p className="text-xs text-muted-foreground">Or try one of these instead</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {QUICK_SEARCHES.map((qs) => (
                          <button
                            key={qs.title}
                            onClick={() => handleSearch(`${qs.artist} - ${qs.title}`)}
                            className="px-3 py-1.5 rounded-lg border border-border/50 bg-background hover:bg-secondary hover:border-primary/30 transition-all text-xs"
                          >
                            <span className="text-primary font-medium">{qs.title}</span>
                            <span className="text-muted-foreground"> — {qs.artist}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!hasSearched && !isLoading && !albumData && !playlistData && (
                <div className="p-6 space-y-8 max-w-3xl mx-auto">
                  <QuickGuide />
                  {recentSearchCards.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-secondary-foreground">Recent Searches</h3>
                      <div className="space-y-1.5">
                        {recentSearchCards.map((search, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSearch(search.artist && search.title ? `${search.artist} - ${search.title}` : search.query)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/50 hover:border-primary/20 transition-all text-left group"
                          >
                            {search.coverUrl ? (
                              <img src={search.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                                <Music className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{search.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{search.artist}</p>
                            </div>
                            <RotateCw className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <SongRecommendations history={history} favorites={[]} onSearch={handleSearch} />
                  <TrendingSongs onSearch={handleSearch} />
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  // Mobile song detail view
  if (isMobile && showingResults) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background p-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleNewSearch}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{songData.title}</p>
              <p className="text-xs text-muted-foreground truncate">{songData.artist}</p>
            </div>
          </header>
          <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />
          <div className="flex-1 overflow-auto">
            <SongProfilePanel
              ref={songPanelRef}
              songData={{
                title: songData.title,
                artist: songData.artist,
                album: songData.album || undefined,
                coverUrl: songData.coverUrl || undefined,
                recordLabel: songData.recordLabel || undefined,
                isrc: songData.isrc || undefined,
                releaseDate: songData.releaseDate || undefined,
              }}
              credits={credits}
              chartPlacements={chartPlacements}
              isLoadingPro={isLoadingPro}
              isLoadingShares={isLoadingShares}
              proError={proError}
              onRetryPro={() => handleRetryPro(selectedRegions)}
              onViewCatalog={(name, role) => setCatalogTarget({ name, role })}
              onClose={handleNewSearch}
              songProjectData={songProjectData}
              multiSourceData={multiSourceData}
              isLoadingMultiSource={isLoadingMultiSource}
              collectingPublishers={collectingPublishers}
              detectedOrgs={detectedOrgs}
            />
            {catalogTarget && (
              <div className="p-6">
                <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
              </div>
            )}
          </div>
        </div>
        <ArtistProfile artistName={artistProfile?.name || ""} coverUrl={artistProfile?.coverUrl} open={!!artistProfile} onClose={() => setArtistProfile(null)} onCheckCredits={(q) => handleSearch(q)} onOpenCatalog={(name) => { setArtistProfile(null); setCatalogTarget({ name, role: "artist" }); }} />
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} history={history} onSearch={handleSearch} onToggleFavorites={() => {}} onToggleTheme={() => {}} onOpenDeals={() => {}} onOpenHistory={() => setActiveSection("history")} />
        <BackToTop />
        <OnboardingTour />
        <HowToTab open={showGuide} onOpenChange={setShowGuide} />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <AppShell
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onSearchSong={handleSearch}
        onViewCatalog={(name, role) => setCatalogTarget({ name, role })}
        watchlistDrawerOpen={watchlistDrawerOpen}
        onToggleWatchlistDrawer={setWatchlistDrawerOpen}
      >
        {renderCenterContent()}
      </AppShell>

      <ArtistProfile artistName={artistProfile?.name || ""} coverUrl={artistProfile?.coverUrl} open={!!artistProfile} onClose={() => setArtistProfile(null)} onCheckCredits={(q) => handleSearch(q)} onOpenCatalog={(name) => { setArtistProfile(null); setCatalogTarget({ name, role: "artist" }); }} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} history={history} onSearch={handleSearch} onToggleFavorites={() => {}} onToggleTheme={() => {}} onOpenDeals={() => {}} onOpenHistory={() => setActiveSection("history")} />
      <BackToTop />
      <OnboardingTour />
      <HowToTab open={showGuide} onOpenChange={setShowGuide} />
    </TooltipProvider>
  );
};

export default Index;
