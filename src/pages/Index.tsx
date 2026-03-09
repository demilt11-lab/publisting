import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Disc3, Heart, LogIn, LogOut, Share2, Check, Users, Sun, Moon, RotateCcw, Clock, HelpCircle, MoreVertical, Sparkles, X, Search, RefreshCw, FolderOpen, Eye, Layers } from "lucide-react";
import { useTheme } from "next-themes";
import { SearchHistory } from "@/components/SearchHistory";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { Link, useSearchParams } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
import { SongCardSkeleton } from "@/components/SongCardSkeleton";
import { CreditsSection } from "@/components/CreditsSection";
import { StatsBar } from "@/components/StatsBar";
import { CreditsExport } from "@/components/CreditsExport";
import { RightsStatusSummary } from "@/components/RightsStatusSummary";
import { PublishingSplitChart } from "@/components/PublishingSplitChart";

import { BatchUpload } from "@/components/BatchUpload";
import { BackToTop } from "@/components/BackToTop";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { DealsTracker, useDeals } from "@/components/DealsTracker";
import { ArtistProfile } from "@/components/ArtistProfile";
import { ComparePanel, CompareSong } from "@/components/ComparePanel";
import { TrendingSongs } from "@/components/TrendingSongs";
import { NotificationBell } from "@/components/NotificationBell";
import { REGIONS } from "@/components/RegionFilter";
import { AlbumTrackSelector, AlbumInfo, AlbumTrack } from "@/components/AlbumTrackSelector";
import { PlaylistTrackSelector } from "@/components/PlaylistTrackSelector";
import { BatchCreditsDisplay, TrackCredits } from "@/components/BatchCreditsDisplay";
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
import { QuickGuide } from "@/components/QuickGuide";
import { AdvancedToolsPanel } from "@/components/AdvancedToolsPanel";
import { SongDetailTabs } from "@/components/SongDetailTabs";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { checkForAlbum } from "@/lib/api/albumLookup";
import { checkForPlaylist, PlaylistInfo, PlaylistTrack } from "@/lib/api/playlistLookup";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useSongLookup } from "@/hooks/useSongLookup";
import { useProjects } from "@/hooks/useProjects";
import { useWatchlist } from "@/hooks/useWatchlist";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LOADING_MESSAGES = [
  "Searching MusicBrainz database...",
  "Looking up publishing rights...",
  "Checking PRO registries...",
  "Fetching streaming stats...",
];

const SLOW_SEARCH_THRESHOLD = 15000; // 15 seconds

const QUICK_SEARCHES = [
  { title: "Blinding Lights", artist: "The Weeknd" },
  { title: "Shape of You", artist: "Ed Sheeran" },
  { title: "Happy", artist: "Pharrell Williams" },
];

const Index = () => {
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
  const [showHistoryTab, setShowHistoryTab] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { projects } = useProjects();
  const { watchlist } = useWatchlist();

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
    performSongLookup, handleRetryPro, cancelSearch
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
          setShowHistoryTab(v => !v);
          setShowFavorites(false);
          setShowTeams(false);
          setShowProjects(false);
          setShowWatchlist(false);
          break;
        case "f":
          if (user) {
            setShowFavorites(v => !v);
            setShowTeams(false);
            setShowProjects(false);
            setShowWatchlist(false);
          }
          break;
        case "p":
          setShowProjects(v => !v);
          setShowFavorites(false);
          setShowTeams(false);
          setShowHistoryTab(false);
          setShowWatchlist(false);
          break;
        case "w":
          setShowWatchlist(v => !v);
          setShowProjects(false);
          setShowFavorites(false);
          setShowTeams(false);
          setShowHistoryTab(false);
          break;
        case "d":
          setTheme(theme === "dark" ? "light" : "dark");
          break;
        case "escape":
          setShowFavorites(false);
          setShowTeams(false);
          setShowHistoryTab(false);
          setShowProjects(false);
          setShowWatchlist(false);
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
    setIsCheckingLink(true);
    setAlbumData(null);
    setPlaylistData(null);
    setShowBatchResults(false);
    setBatchCredits([]);
    setCompletedTrackIds([]);
    setLastSearchQuery(query);
    window.scrollTo({ top: 0, behavior: 'smooth' });

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
    setLastSearchQuery('');
    setSearchParams({}, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [cancelSearch, setSearchParams]);

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
  const alertCount = alerts.length > 9 ? "9+" : alerts.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Clean background — no gradient */}

      <div className="relative z-10">
        {/* Header — minimal, executive */}
        <header className="border-b border-border/50 bg-background sticky top-0 z-50">
          <div className="container py-3">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleNewSearch} role="button" aria-label="PubCheck home">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Disc3 className="w-3.5 h-3.5 text-primary" />
                </div>
                <h1 className="font-display text-sm font-semibold text-foreground tracking-tight">PubCheck</h1>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-6 bg-border/40 mx-3" />

              {/* Primary nav */}
              <TooltipProvider delayDuration={300}>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {/* Batch Search */}
                  <BatchUpload selectedRegions={selectedRegions} onSongClick={handleSearch} />
                  
                  {/* Deals */}
                  <DealsTracker deals={deals} updateDeal={updateDeal} removeDeal={removeDeal} />
                  
                  {/* Compare */}
                  <ComparePanel songs={compareSongs} onRemove={(i) => setCompareSongs(prev => prev.filter((_, idx) => idx !== i))} onClear={() => setCompareSongs([])} />
                  
                  {/* History */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showHistoryTab ? "secondary" : "ghost"} size="sm" className="relative gap-1 h-8" onClick={() => { setShowHistoryTab(v => !v); setShowFavorites(false); setShowTeams(false); setShowProjects(false); }} aria-label="Search history">
                        <Clock className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">History</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Search history (H)</TooltipContent>
                  </Tooltip>

                  {/* Projects */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showProjects ? "secondary" : "ghost"} size="sm" className="relative gap-1 h-8" onClick={() => { setShowProjects(v => !v); setShowFavorites(false); setShowTeams(false); setShowHistoryTab(false); }} aria-label="Projects">
                        <FolderOpen className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Projects</span>
                        {projects.length > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center px-0.5">
                            {projects.length}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Project crates (P)</TooltipContent>
                  </Tooltip>

                  {/* Watchlist */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showWatchlist ? "secondary" : "ghost"} size="sm" className="relative gap-1 h-8" onClick={() => { setShowWatchlist(v => !v); setShowProjects(false); setShowFavorites(false); setShowTeams(false); setShowHistoryTab(false); }} aria-label="Watchlist">
                        <Eye className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Watch</span>
                        {watchlist.length > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center px-0.5">
                            {watchlist.length}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Watchlist (W)</TooltipContent>
                  </Tooltip>
                  {user && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant={showFavorites ? "secondary" : "ghost"} size="sm" className="relative h-8 gap-1" onClick={() => { setShowFavorites(!showFavorites); setShowTeams(false); setShowHistoryTab(false); setShowProjects(false); }} aria-label="Favorites">
                          <Heart className="w-4 h-4" />
                          <span className="hidden sm:inline text-xs">Favorites</span>
                          {alerts.length > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center px-0.5">
                              {alertCount}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Favorites (F)</TooltipContent>
                    </Tooltip>
                  )}

                  {/* Guide */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showGuide ? "secondary" : "ghost"} size="sm" className="gap-1 h-8" onClick={() => setShowGuide(true)} aria-label="Guide">
                        <HelpCircle className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Guide</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>How-to guide</TooltipContent>
                  </Tooltip>

                  {/* Notification Bell */}
                  {user && <NotificationBell favorites={favorites} onRecheck={(name) => handleSearch(name)} />}

                  {/* Overflow menu — secondary actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8" aria-label="More options">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setCommandOpen(true)} className="gap-2">
                        <Search className="w-4 h-4" />
                        Command Palette
                        <kbd className="ml-auto text-[10px] text-muted-foreground font-mono">⌘K</kbd>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user && (
                        <DropdownMenuItem onClick={() => { setShowTeams(!showTeams); setShowFavorites(false); setShowHistoryTab(false); }} className="gap-2">
                          <Users className="w-4 h-4" />
                          Teams
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="gap-2">
                        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        {theme === "dark" ? "Light Mode" : "Dark Mode"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user ? (
                        <DropdownMenuItem onClick={signOut} className="gap-2">
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem asChild>
                          <Link to="/auth" className="gap-2">
                            <LogIn className="w-4 h-4" />
                            Sign In
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </header>

        {/* Command Palette */}
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          history={history}
          onSearch={handleSearch}
          onToggleFavorites={() => { if (user) { setShowFavorites(v => !v); setShowTeams(false); } }}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenDeals={() => {}}
          onOpenHistory={() => { setShowHistoryTab(v => !v); setShowFavorites(false); setShowTeams(false); }}
        />

        {/* Main Content */}
        <main className="container py-6 sm:py-10">
          {/* Panels that overlay */}
          {showHistoryTab && <div className="mb-8"><SearchHistoryTab history={history} onSearch={handleSearch} onRemove={removeEntry} onClear={clearHistory} onClose={() => setShowHistoryTab(false)} /></div>}
          {showProjects && <div className="mb-8"><ProjectsView onClose={() => setShowProjects(false)} onSearchSong={handleSearch} /></div>}
          {showWatchlist && <div className="mb-8"><WatchlistView onClose={() => setShowWatchlist(false)} onSearchSong={handleSearch} /></div>}
          {showTeams && user && <div className="mb-8"><TeamPanel onClose={() => setShowTeams(false)} /></div>}
          {showFavorites && user && <div className="mb-8"><FavoritesTab onClose={() => setShowFavorites(false)} onSearchSong={handleSearch} onViewCatalog={(name, role) => { setShowFavorites(false); setCatalogTarget({ name, role }); }} /></div>}
          {showBatchResults && batchCredits.length > 0 && <BatchCreditsDisplay tracksCredits={batchCredits} onClose={handleCloseBatchResults} />}

          {/* Search-first home — tighter vertical spacing */}
          {!hasSearched && !isLoading && !isCheckingLink && !albumData && !playlistData && !showBatchResults && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Mission line */}
              <div className="text-center">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Search any song to see who controls the rights and how easy it is to make a deal.
                </p>
              </div>

              {/* Search bar */}
              <SearchBar
                onSearch={handleSearch}
                onCancel={() => { cancelSearch(); setIsCheckingLink(false); }}
                isLoading={isLoading || isCheckingLink}
                recentSearches={recentSearches}
              />

              {/* 3-step guide */}
              <QuickGuide />

              {/* Advanced tools — collapsed by default */}
              <AdvancedToolsPanel
                history={history}
                deals={deals}
                filters={searchFilters}
                onFiltersChange={setSearchFilters}
                selectedRegions={selectedRegions}
                onRegionsChange={setSelectedRegions}
              />

              {/* Recent searches or quick examples */}
              {history.length > 0 ? (
                <SearchHistory
                  history={history}
                  onSelect={(q) => handleSearch(q)}
                  onRemove={removeEntry}
                  onClear={clearHistory}
                  onTogglePin={togglePin}
                />
              ) : (
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {QUICK_SEARCHES.map((qs) => (
                    <button key={qs.title} onClick={() => handleSearch(`${qs.artist} - ${qs.title}`)} className="px-4 py-2 rounded-xl border border-border/50 bg-card/50 hover:bg-accent hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground">
                      <span className="text-primary font-medium">{qs.title}</span>
                      <span className="text-muted-foreground"> — {qs.artist}</span>
                    </button>
                  ))}
                </div>
              )}

              <TrendingSongs onSearch={handleSearch} />
            </div>
          )}

          {/* Playlist/Album selectors */}
          {playlistData && !isLoading && !showBatchResults && (
            <PlaylistTrackSelector playlist={playlistData} onSelectTrack={handleTrackSelect} onBatchLookup={handleBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
          )}
          {albumData && !showBatchResults && (
            <AlbumTrackSelector album={albumData} onSelectTrack={handleTrackSelect} onBatchLookup={handleAlbumBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
          )}

          {/* Search bar when results are showing */}
          {(hasSearched || isLoading) && (
            <div className="max-w-2xl mx-auto mb-6">
              <SearchBar
                onSearch={handleSearch}
                onCancel={() => { cancelSearch(); setIsCheckingLink(false); }}
                isLoading={isLoading || isCheckingLink}
                recentSearches={recentSearches}
              />
            </div>
          )}

          {/* RESULTS — tabbed layout */}
          {showingResults && (
            <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
              <SongCard
                title={songData.title}
                artist={songData.artist}
                album={songData.album || "Unknown Album"}
                coverUrl={songData.coverUrl || undefined}
                releaseDate={songData.releaseDate || undefined}
                sourceUrl={lastSearchQuery.startsWith('http') ? lastSearchQuery : undefined}
                dataSource={dataSource}
                recordLabel={songData.recordLabel || undefined}
                isrc={songData.isrc || undefined}
                creditsCount={credits.length > 0 ? credits.length : undefined}
                credits={credits}
                chartPlacementsCount={chartPlacements.length}
                onSearchArtist={(a) => setArtistProfile({ name: a, coverUrl: songData.coverUrl || undefined })}
                onAddToDeal={handleAddToDeal}
                onAddToCompare={handleAddToCompare}
                compareCount={compareSongs.length}
              />

              {/* Chart badges */}
              <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />

              {/* Rights + Stats summary */}
              <div className="space-y-0">
                <RightsStatusSummary credits={credits} />
                <StatsBar credits={credits} />
              </div>
              
              {/* Export */}
              <div className="flex justify-end">
                <CreditsExport
                  credits={credits}
                  songTitle={songData.title}
                  artist={songData.artist}
                  album={songData.album || undefined}
                  isrc={songData.isrc || undefined}
                  recordLabel={songData.recordLabel || undefined}
                  chartPlacements={chartPlacements.map(cp => ({ chart: cp.chart, peak: cp.peakPosition || 0, date: cp.date }))}
                  onShare={handleShare}
                  shareLabel={sharecopied ? "Copied!" : "Share Link"}
                />
              </div>

              {/* Tabbed detail view */}
              <SongDetailTabs
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
                songProjectData={songProjectData}
              />

              {catalogTarget && (
                <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
              )}

              <CreditsDebugPanel debugSources={debugSources} dataSource={dataSource} />
              {sources.length > 0 && (
                <details className="text-center mt-4">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1">
                    Data Sources ({sources.length} registries)
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1 justify-center max-w-xl mx-auto">
                    {sources.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={handleNewSearch} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  New Search
                </Button>
              </div>
            </div>
          )}

          {/* No results / Error state */}
          {hasSearched && !isLoading && !songData && !albumData && !playlistData && (
            <div className="max-w-3xl mx-auto">
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
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://open.spotify.com/search/${encodeURIComponent(lastSearchQuery)}`} target="_blank" rel="noopener noreferrer" className="gap-2">
                      Try on Spotify →
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && !playlistData && (
            <div className="max-w-3xl mx-auto space-y-4">
              <SongCardSkeleton />
              {/* Progress bar */}
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
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
                  <Disc3 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground">Checking link type...</p>
              </div>
            </div>
          )}

        </main>

        <footer className="border-t border-border/50 mt-auto">
          <div className="container py-6 text-center text-sm text-muted-foreground">
            <p>Data sourced from MusicBrainz + public PRO registries worldwide</p>
          </div>
        </footer>
      </div>

      <ArtistProfile
        artistName={artistProfile?.name || ""}
        coverUrl={artistProfile?.coverUrl}
        open={!!artistProfile}
        onClose={() => setArtistProfile(null)}
        onCheckCredits={(q) => handleSearch(q)}
        onOpenCatalog={(name) => { setArtistProfile(null); setCatalogTarget({ name, role: "artist" }); }}
      />

      <BackToTop />
      <KeyboardShortcuts />
      <OnboardingTour />
      <HowToTab open={showGuide} onOpenChange={setShowGuide} />
    </div>
  );
};

export default Index;
