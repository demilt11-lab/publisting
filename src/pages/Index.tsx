import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Disc3, Heart, Share2, RotateCcw, RefreshCw, X, ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useSongLookup } from "@/hooks/useSongLookup";
import { useProjects } from "@/hooks/useProjects";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useIsMobile } from "@/hooks/use-mobile";

import { AppShell, NavSection } from "@/components/layout/AppShell";
import { CenterPanel } from "@/components/layout/CenterPanel";
import { SongProfilePanel } from "@/components/layout/SongProfilePanel";
import { SongResultCard } from "@/components/layout/SongResultCard";

import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
import { SongCardSkeleton } from "@/components/SongCardSkeleton";
import { CreditsExport } from "@/components/CreditsExport";
import { RightsStatusSummary } from "@/components/RightsStatusSummary";
import { StatsBar } from "@/components/StatsBar";
import { BatchUpload } from "@/components/BatchUpload";
import { BackToTop } from "@/components/BackToTop";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { DealsTracker, useDeals } from "@/components/DealsTracker";
import { ArtistProfile } from "@/components/ArtistProfile";
import { ComparePanel, CompareSong } from "@/components/ComparePanel";
import { NotificationBell } from "@/components/NotificationBell";
import { REGIONS } from "@/components/RegionFilter";
import { AlbumTrackSelector, AlbumInfo, AlbumTrack } from "@/components/AlbumTrackSelector";
import { PlaylistTrackSelector } from "@/components/PlaylistTrackSelector";
import { BatchCreditsDisplay, TrackCredits } from "@/components/BatchCreditsDisplay";
import { PlaylistTrack } from "@/lib/api/playlistLookup";
import { FavoritesTab } from "@/components/FavoritesTab";
import { TeamPanel } from "@/components/TeamPanel";
import { CreditsDebugPanel } from "@/components/CreditsDebugPanel";
import { ChartBadges } from "@/components/ChartPlacements";
import { CatalogSheet } from "@/components/CatalogSheet";
import { CommandPalette } from "@/components/CommandPalette";
import { EMPTY_FILTERS, SearchFilters } from "@/components/AdvancedFilters";
import { SearchHistoryTab } from "@/components/SearchHistoryTab";
import { ProjectsView } from "@/components/ProjectsView";
import { WatchlistView } from "@/components/WatchlistView";
import { OnboardingTour } from "@/components/OnboardingTour";
import { HowToTab } from "@/components/HowToTab";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { checkForAlbum } from "@/lib/api/albumLookup";
import { checkForPlaylist, PlaylistInfo } from "@/lib/api/playlistLookup";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

const LOADING_MESSAGES = [
  "Searching MusicBrainz database...",
  "Looking up publishing rights...",
  "Checking PRO registries...",
  "Fetching streaming stats...",
];

const SLOW_SEARCH_THRESHOLD = 15000;

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
  const [showFavorites, setShowFavorites] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>('');
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
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { projects } = useProjects();
  const { watchlist } = useWatchlist();
  const isMobile = useIsMobile();

  const hasAutoSearched = useRef(false);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { favorites, alerts } = useFavorites();
  const { deals, addDeal, updateDeal, removeDeal } = useDeals();
  const { history, addEntry, clearHistory, removeEntry, togglePin, updateEntryCredits } = useSearchHistory();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();

  const {
    isLoading, isLoadingPro, isLoadingShares, proError,
    songData, dataSource, credits, sources, debugSources, hasSearched,
    performSongLookup, handleRetryPro, cancelSearch, resetResults
  } = useSongLookup();

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
    return () => { clearInterval(interval); if (slowTimerRef.current) clearTimeout(slowTimerRef.current); };
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
      const signed = credits.filter(c => c.publishingStatus === "signed").length;
      updateEntryCredits(lastSearchQuery, signed, credits.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, hasSearched]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(v => !v);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "h":
          setActiveSection(s => s === "history" ? "home" : "history");
          break;
        case "p":
          setActiveSection(s => s === "projects" ? "home" : "projects");
          break;
        case "w":
          setActiveSection(s => s === "watchlist" ? "home" : "watchlist");
          break;
        case "f":
          if (user) setShowFavorites(v => !v);
          break;
        case "d":
          setTheme(theme === "dark" ? "light" : "dark");
          break;
        case "escape":
          setShowFavorites(false);
          setShowTeams(false);
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [user, theme, setTheme]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}?q=${encodeURIComponent(lastSearchQuery)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      toast({ title: "Link copied!", description: "Share this link to show these credits." });
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setShareCopied(false), 2000);
    }
  }, [lastSearchQuery, toast]);

  const handleSearch = useCallback(async (query: string) => {
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
          toast({ title: "Playlist detected", description: playlistResult.message || `Track listing not available for this playlist.`, variant: "default" });
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
          toast({ title: "Album detected", description: `Track listing not available for this platform.`, variant: "default" });
          setIsCheckingLink(false);
          return;
        }
      }
    } catch (error) {
      setIsCheckingLink(false);
      return;
    }

    setIsCheckingLink(false);
    await performSongLookup(query, selectedRegions, undefined, addEntry);
  }, [performSongLookup, selectedRegions, addEntry, toast]);

  const handleNewSearch = useCallback(() => {
    cancelSearch();
    resetResults();
    setLastSearchQuery('');
    setSearchParams({}, { replace: true });
  }, [cancelSearch, resetResults, setSearchParams]);

  const handleTrackSelect = useCallback(async (track: AlbumTrack | PlaylistTrack) => {
    setLoadingTrackId(track.id);
    const searchQuery = `${track.artist} - ${track.title}`;
    await performSongLookup(searchQuery, selectedRegions);
    setAlbumData(null);
    setPlaylistData(null);
    setLoadingTrackId(undefined);
  }, [performSongLookup, selectedRegions]);

  const runBatchLookup = async (tracks: {id: string;title: string;artist: string;}[], onDone: () => void) => {
    const results: TrackCredits[] = [];
    const completed: string[] = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < tracks.length; i += CONCURRENCY) {
      const batch = tracks.slice(i, i + CONCURRENCY);
      setLoadingTrackId(batch[0].id);
      const batchResults = await Promise.allSettled(
        batch.map((track) =>
          performSongLookup(`${track.artist} - ${track.title}`, selectedRegions, { id: track.id, title: track.title, artist: track.artist })
        )
      );
      batchResults.forEach((settled, idx) => {
        if (settled.status === 'fulfilled' && settled.value) results.push(settled.value as TrackCredits);
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
  const handleCancelSelection = useCallback(() => { setAlbumData(null); setPlaylistData(null); setCompletedTrackIds([]); }, []);
  const handleCloseBatchResults = useCallback(() => { setShowBatchResults(false); setBatchCredits([]); setCompletedTrackIds([]); }, []);

  const handleAddToCompare = useCallback((title: string, artist: string) => {
    setCompareSongs(prev => {
      if (prev.length >= 3) { toast({ title: "Compare limit", description: "Max 3 songs. Remove one first." }); return prev; }
      if (prev.some(s => s.title === title && s.artist === artist)) { toast({ title: "Already added" }); return prev; }
      const newCount = prev.length + 1;
      toast({ title: `Added to Compare (${newCount}/3)` });
      return [...prev, { title, artist, credits }];
    });
  }, [credits, toast]);

  const handleAddToDeal = useCallback((title: string, artist: string) => {
    const topPub = credits.find(c => c.publisher)?.publisher || "";
    addDeal(title, artist, topPub);
    toast({ title: "Added to deals", description: `${title} added as Researching.` });
  }, [credits, addDeal, toast]);

  // Compute song metadata for project
  const songProjectData = useMemo(() => {
    if (!songData || credits.length === 0) return null;
    const writers = credits.filter(c => c.role === "writer");
    const publishers = new Set(credits.filter(c => c.publisher).map(c => c.publisher));
    const majorPubs = ["sony", "universal", "warner", "bmg", "kobalt"];
    const pubList = Array.from(publishers);
    const majorCount = pubList.filter(p => majorPubs.some(m => p!.toLowerCase().includes(m))).length;
    const publishingMix = majorCount === 0 ? "indie" : majorCount === pubList.length ? "major" : "mixed";
    const majorLabels = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];
    const labelType = songData.recordLabel && majorLabels.some(m => songData.recordLabel!.toLowerCase().includes(m)) ? "major" : "indie";
    const signedRatio = credits.filter(c => c.publisher).length / credits.length;
    const dealability = signedRatio >= 0.8 && publishers.size <= 2 ? "high" : signedRatio >= 0.5 ? "medium" : "low";
    return {
      title: songData.title,
      artist: songData.artist,
      coverUrl: songData.coverUrl || undefined,
      writersCount: writers.length,
      publishersCount: publishers.size,
      publishingMix: publishingMix as "indie" | "mixed" | "major",
      labelType: labelType as "indie" | "major",
      dealability: dealability as "high" | "medium" | "low",
      recordLabel: songData.recordLabel || undefined,
    };
  }, [songData, credits]);

  const recentSearches = history.slice(0, 5).map(h => ({ query: h.query, title: h.title, artist: h.artist }));
  const showingResults = hasSearched && !isLoading && !albumData && !playlistData && !showBatchResults && songData;

  // Handle section navigation
  const handleSectionChange = (section: NavSection) => {
    setActiveSection(section);
    setShowFavorites(false);
    setShowTeams(false);
  };

  // Build the center panel content based on active section
  const renderCenterContent = () => {
    // Handle overlay panels
    if (showFavorites && user) {
      return (
        <div className="p-6">
          <FavoritesTab onClose={() => setShowFavorites(false)} onSearchSong={handleSearch} onViewCatalog={(name, role) => { setShowFavorites(false); setCatalogTarget({ name, role }); }} />
        </div>
      );
    }
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

    // Section-specific views
    switch (activeSection) {
      case "projects":
        return (
          <div className="p-6">
            <ProjectsView onClose={() => setActiveSection("home")} onSearchSong={handleSearch} />
          </div>
        );
      case "watchlist":
        return (
          <div className="p-6">
            <WatchlistView onClose={() => setActiveSection("home")} onSearchSong={handleSearch} />
          </div>
        );
      case "history":
        return (
          <div className="p-6">
            <SearchHistoryTab history={history} onSearch={handleSearch} onRemove={removeEntry} onClear={clearHistory} onClose={() => setActiveSection("home")} />
          </div>
        );
      case "settings":
        return (
          <div className="p-6 space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-surface">
                <div>
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </Button>
              </div>
              {user && (
                <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-surface">
                  <div>
                    <p className="text-sm font-medium text-foreground">Account</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
                </div>
              )}
            </div>
          </div>
        );
      default:
        // Home view with search
        return (
          <>
            {/* Playlist/Album selectors */}
            {playlistData && !isLoading && !showBatchResults && (
              <div className="p-6">
                <PlaylistTrackSelector playlist={playlistData} onSelectTrack={handleTrackSelect} onBatchLookup={handleBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
              </div>
            )}
            {albumData && !showBatchResults && (
              <div className="p-6">
                <AlbumTrackSelector album={albumData} onSelectTrack={handleTrackSelect} onBatchLookup={handleAlbumBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
              </div>
            )}

            {/* Normal search/results view */}
            {!albumData && !playlistData && (
              <CenterPanel
                onSearch={handleSearch}
                onCancel={() => { cancelSearch(); setIsCheckingLink(false); }}
                isLoading={isLoading || isCheckingLink}
                recentSearches={recentSearches}
                history={history}
                deals={deals}
                filters={searchFilters}
                onFiltersChange={setSearchFilters}
                selectedRegions={selectedRegions}
                onRegionsChange={setSelectedRegions}
                hasSearched={hasSearched}
                searchResults={showingResults ? [{
                  title: songData.title,
                  artist: songData.artist,
                  coverUrl: songData.coverUrl || undefined,
                  dealability: songProjectData?.dealability,
                  publishingMix: songProjectData?.publishingMix,
                  labelType: songProjectData?.labelType,
                  writersCount: songProjectData?.writersCount,
                  publishersCount: songProjectData?.publishersCount,
                  hasProData: true,
                }] : undefined}
                selectedResultIndex={showingResults ? 0 : undefined}
                onSelectResult={() => {}}
              />
            )}

            {/* Loading State */}
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
                {showSlowMessage && (
                  <p className="text-center text-xs text-muted-foreground/70 animate-fade-in">
                    Still searching… this may take a moment for international tracks.
                  </p>
                )}
              </div>
            )}

            {isCheckingLink && (
              <div className="p-6">
                <div className="glass rounded-2xl p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
                    <Disc3 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <p className="text-muted-foreground">Checking link type...</p>
                </div>
              </div>
            )}

            {/* No results */}
            {hasSearched && !isLoading && !songData && !albumData && !playlistData && (
              <div className="p-6">
                <div className="glass rounded-2xl p-8 sm:p-12 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                    <Disc3 className="w-8 h-8 text-destructive" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-foreground">No Results Found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto text-sm">
                    No results for "<span className="text-foreground font-medium">{lastSearchQuery}</span>". Try checking the spelling, use "Artist - Song Title" format, or paste a Spotify/Apple Music link.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                    <Button variant="default" size="sm" onClick={() => handleSearch(lastSearchQuery)} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> Retry Search
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleNewSearch} className="gap-2">
                      <RotateCcw className="w-4 h-4" /> New Search
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
    }
  };

  // Build the right panel content (song profile)
  const renderRightPanel = () => {
    if (!showingResults) return null;
    
    return (
      <SongProfilePanel
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
        onClose={isMobile ? handleNewSearch : undefined}
        songProjectData={songProjectData}
      />
    );
  };

  // Mobile-specific song profile view
  if (isMobile && showingResults) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background p-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleNewSearch}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{songData.title}</p>
              <p className="text-xs text-muted-foreground truncate">{songData.artist}</p>
            </div>
          </header>
          
          {/* Chart badges loader */}
          <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />
          
          {/* Song profile */}
          <div className="flex-1 overflow-auto">
            {renderRightPanel()}
          </div>
        </div>

        {catalogTarget && (
          <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
        )}
        
        <ArtistProfile
          artistName={artistProfile?.name || ""}
          coverUrl={artistProfile?.coverUrl}
          open={!!artistProfile}
          onClose={() => setArtistProfile(null)}
          onCheckCredits={(q) => handleSearch(q)}
          onOpenCatalog={(name) => { setArtistProfile(null); setCatalogTarget({ name, role: "artist" }); }}
        />

        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          history={history}
          onSearch={handleSearch}
          onToggleFavorites={() => { if (user) { setShowFavorites(v => !v); } }}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenDeals={() => {}}
          onOpenHistory={() => setActiveSection("history")}
        />

        <BackToTop />
        <KeyboardShortcuts />
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
        showRightPanel={!!showingResults}
        onCloseRightPanel={handleNewSearch}
        rightPanel={
          <>
            {/* Chart badges loader (hidden, just loads data) */}
            {showingResults && (
              <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />
            )}
            {renderRightPanel()}
          </>
        }
      >
        {renderCenterContent()}
      </AppShell>

      {catalogTarget && (
        <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
      )}
      
      <ArtistProfile
        artistName={artistProfile?.name || ""}
        coverUrl={artistProfile?.coverUrl}
        open={!!artistProfile}
        onClose={() => setArtistProfile(null)}
        onCheckCredits={(q) => handleSearch(q)}
        onOpenCatalog={(name) => { setArtistProfile(null); setCatalogTarget({ name, role: "artist" }); }}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        history={history}
        onSearch={handleSearch}
        onToggleFavorites={() => { if (user) { setShowFavorites(v => !v); } }}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onOpenDeals={() => {}}
        onOpenHistory={() => setActiveSection("history")}
      />

      <BackToTop />
      <KeyboardShortcuts />
      <OnboardingTour />
      <HowToTab open={showGuide} onOpenChange={setShowGuide} />
    </TooltipProvider>
  );
};

export default Index;
