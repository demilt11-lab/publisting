import { useState, useEffect, useRef, useCallback } from "react";
import { Disc3, Heart, LogIn, LogOut, Share2, Check, Users, Sun, Moon, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { SearchHistory } from "@/components/SearchHistory";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { Link, useSearchParams } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
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
import { RegionFilter, REGIONS } from "@/components/RegionFilter";
import { AlbumTrackSelector, AlbumInfo, AlbumTrack } from "@/components/AlbumTrackSelector";
import { PlaylistTrackSelector } from "@/components/PlaylistTrackSelector";
import { BatchCreditsDisplay, TrackCredits } from "@/components/BatchCreditsDisplay";
import { FavoritesTab } from "@/components/FavoritesTab";
import { TeamPanel } from "@/components/TeamPanel";
import { CreditsDebugPanel } from "@/components/CreditsDebugPanel";
import { ChartBadges, ChartDetailsSection } from "@/components/ChartPlacements";
import { CatalogSheet } from "@/components/CatalogSheet";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { checkForAlbum } from "@/lib/api/albumLookup";
import { checkForPlaylist, PlaylistInfo, PlaylistTrack } from "@/lib/api/playlistLookup";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useSongLookup } from "@/hooks/useSongLookup";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Auto-search from URL ?q= parameter
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      handleSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update URL when search completes
  useEffect(() => {
    if (hasSearched && lastSearchQuery) {
      setSearchParams({ q: lastSearchQuery }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSearched, lastSearchQuery]);

  // Update history with credit counts when credits load
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
      switch (e.key.toLowerCase()) {
        case "h":
          toast({ title: "History (H)", description: "Scroll down to see search history." });
          break;
        case "f":
          if (user) {
            setShowFavorites(v => !v);
            setShowTeams(false);
            toast({ title: "Favorites toggled (F)" });
          }
          break;
        case "d":
          setTheme(theme === "dark" ? "light" : "dark");
          toast({ title: `Theme: ${theme === "dark" ? "Light" : "Dark"} (D)` });
          break;
        case "escape":
          setShowFavorites(false);
          setShowTeams(false);
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [user, theme, setTheme, toast]);

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
      console.error('Link check error:', error);
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
          performSongLookup(`${track.artist} - ${track.title}`, selectedRegions, {
            id: track.id, title: track.title, artist: track.artist
          })
        )
      );
      batchResults.forEach((settled, idx) => {
        if (settled.status === 'fulfilled' && settled.value) {
          results.push(settled.value as TrackCredits);
        }
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
      if (prev.length >= 3) {
        toast({ title: "Compare limit", description: "Max 3 songs. Remove one first." });
        return prev;
      }
      if (prev.some(s => s.title === title && s.artist === artist)) {
        toast({ title: "Already added" });
        return prev;
      }
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

  const showingResults = hasSearched && !isLoading && !albumData && !playlistData && !showBatchResults && songData;

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />

      <div className="relative z-10">
        {/* Header — sticky */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
          <div className="container py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={handleNewSearch}>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Disc3 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground">PubCheck</h1>
                  <p className="text-xs text-muted-foreground hidden sm:block">Publishing Rights Lookup</p>
                </div>
              </div>

              <TooltipProvider delayDuration={300}>
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                  <BatchUpload selectedRegions={selectedRegions} />
                  <DealsTracker deals={deals} updateDeal={updateDeal} removeDeal={removeDeal} />
                  <ComparePanel songs={compareSongs} onRemove={(i) => setCompareSongs(prev => prev.filter((_, idx) => idx !== i))} onClear={() => setCompareSongs([])} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="w-9 h-9">
                        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Toggle theme (D)</TooltipContent>
                  </Tooltip>
                  {user && (
                    <NotificationBell favorites={favorites} onRecheck={(name) => handleSearch(name)} />
                  )}
                  {user && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => { setShowTeams(!showTeams); setShowFavorites(false); }}>
                          <Users className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Teams</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Manage teams</TooltipContent>
                    </Tooltip>
                  )}
                  {user && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="relative" onClick={() => { setShowFavorites(!showFavorites); setShowTeams(false); }}>
                          <Heart className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Favorites</span>
                          {alerts.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                              {alerts.length}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View favorites (F)</TooltipContent>
                    </Tooltip>
                  )}
                  {user ? (
                    <Button variant="outline" size="sm" onClick={signOut}>
                      <LogOut className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Sign Out</span>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/auth">
                        <LogIn className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Sign In</span>
                      </Link>
                    </Button>
                  )}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container py-8 sm:py-12">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
              Check Publishing Rights
              <span className="text-gradient-primary"> Instantly</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg sm:text-2xl">Discover who's signed and who controls the rights.</p>
          </div>

          <div className="mb-8 sm:mb-12 space-y-4">
            <SearchBar onSearch={handleSearch} onCancel={() => { cancelSearch(); setIsCheckingLink(false); }} isLoading={isLoading || isCheckingLink} />
            <div className="flex justify-center">
              <RegionFilter selectedRegions={selectedRegions} onRegionsChange={setSelectedRegions} />
            </div>
          </div>

          {showTeams && user && <div className="mb-8"><TeamPanel onClose={() => setShowTeams(false)} /></div>}
          {showFavorites && user && <div className="mb-8"><FavoritesTab onClose={() => setShowFavorites(false)} /></div>}
          {showBatchResults && batchCredits.length > 0 && <BatchCreditsDisplay tracksCredits={batchCredits} onClose={handleCloseBatchResults} />}

          {playlistData && !isLoading && !showBatchResults && (
            <PlaylistTrackSelector playlist={playlistData} onSelectTrack={handleTrackSelect} onBatchLookup={handleBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
          )}
          {albumData && !showBatchResults && (
            <AlbumTrackSelector album={albumData} onSelectTrack={handleTrackSelect} onBatchLookup={handleAlbumBatchLookup} onCancel={handleCancelSelection} isLoading={isLoading} loadingTrackId={loadingTrackId} completedTrackIds={completedTrackIds} />
          )}

          {/* Results */}
          {showingResults && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              <SongCard
                title={songData.title}
                artist={songData.artist}
                album={songData.album || "Unknown Album"}
                coverUrl={songData.coverUrl || undefined}
                releaseDate={songData.releaseDate || undefined}
                sourceUrl={lastSearchQuery.startsWith('http') ? lastSearchQuery : undefined}
                dataSource={dataSource}
                recordLabel={songData.recordLabel || undefined}
                creditsCount={credits.length > 0 ? credits.length : undefined}
                onSearchArtist={(a) => setArtistProfile({ name: a, coverUrl: songData.coverUrl || undefined })}
                onAddToDeal={handleAddToDeal}
                onAddToCompare={handleAddToCompare}
                compareCount={compareSongs.length}
              />

              <div className="flex justify-center -mt-3">
                <ChartBadges songTitle={songData.title} artist={songData.artist} onDataLoaded={setChartPlacements} />
              </div>

              <div className="space-y-3">
                <RightsStatusSummary credits={credits} />
                <StatsBar credits={credits} />
                <div className="flex justify-end gap-2 flex-wrap">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleShare}>
                        {sharecopied ? <Check className="w-4 h-4 mr-1.5" /> : <Share2 className="w-4 h-4 mr-1.5" />}
                        {sharecopied ? "Copied!" : "Share"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy shareable link</TooltipContent>
                  </Tooltip>
                  <CreditsExport credits={credits} songTitle={songData.title} artist={songData.artist} album={songData.album || undefined} />
                </div>
              </div>

              <ChartDetailsSection placements={chartPlacements} />
              <PublishingSplitChart credits={credits} />

              {catalogTarget && (
                <CatalogSheet name={catalogTarget.name} role={catalogTarget.role} onClose={() => setCatalogTarget(null)} />
              )}

              <CreditsSection
                credits={credits}
                isLoadingPro={isLoadingPro}
                isLoadingShares={isLoadingShares}
                proError={proError}
                onRetryPro={() => handleRetryPro(selectedRegions)}
                onViewCatalog={(name, role) => setCatalogTarget({ name, role })}
              />

              <CreditsDebugPanel debugSources={debugSources} dataSource={dataSource} />
              {sources.length > 0 && <p className="text-center text-xs text-muted-foreground mt-4">Searched: {sources.join(', ')}</p>}

              {/* New Search button */}
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={handleNewSearch} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  New Search
                </Button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && !playlistData && (
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
                  <Disc3 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground">Searching MusicBrainz & PRO databases...</p>
              </div>
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

          {/* Empty State */}
          {!hasSearched && !isLoading && !isCheckingLink && !albumData && !playlistData && !showBatchResults && (
            <div className="max-w-3xl mx-auto space-y-8">
              <TrendingSongs onSearch={handleSearch} />
              {history.length > 0 && (
                <SearchHistory
                  history={history}
                  onSelect={(q) => handleSearch(q)}
                  onRemove={removeEntry}
                  onClear={clearHistory}
                  onTogglePin={togglePin}
                />
              )}
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                  <Disc3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">Ready to Search</h3>
                <p className="text-muted-foreground max-w-md mx-auto">Paste a song, album, or playlist link to see publishing information from worldwide PROs.</p>
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

      {/* Artist Profile Slide-over (z-60 to layer above other sheets) */}
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
    </div>
  );
};

export default Index;
