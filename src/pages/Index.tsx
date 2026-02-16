import { useState, useEffect, useRef } from "react";
import { Disc3, Heart, LogIn, LogOut, Share2, Check } from "lucide-react";
import { SearchHistory } from "@/components/SearchHistory";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { Link, useSearchParams } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
import { CreditsSection } from "@/components/CreditsSection";
import { StatsBar } from "@/components/StatsBar";
import { CreditsExport } from "@/components/CreditsExport";
import { RegionFilter, REGIONS } from "@/components/RegionFilter";
import { AlbumTrackSelector, AlbumInfo, AlbumTrack } from "@/components/AlbumTrackSelector";
import { PlaylistTrackSelector } from "@/components/PlaylistTrackSelector";
import { BatchCreditsDisplay, TrackCredits } from "@/components/BatchCreditsDisplay";
import { FavoritesTab } from "@/components/FavoritesTab";
import { CreditsDebugPanel } from "@/components/CreditsDebugPanel";
import { checkForAlbum } from "@/lib/api/albumLookup";
import { checkForPlaylist, PlaylistInfo, PlaylistTrack } from "@/lib/api/playlistLookup";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useSongLookup } from "@/hooks/useSongLookup";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(REGIONS.map(r => r.id));
  const [albumData, setAlbumData] = useState<AlbumInfo | null>(null);
  const [playlistData, setPlaylistData] = useState<PlaylistInfo | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | undefined>();
  const [completedTrackIds, setCompletedTrackIds] = useState<string[]>([]);
  const [batchCredits, setBatchCredits] = useState<TrackCredits[]>([]);
  const [showBatchResults, setShowBatchResults] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>('');
  const [sharecopied, setShareCopied] = useState(false);

  const hasAutoSearched = useRef(false);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { alerts } = useFavorites();
  const { history, addEntry, clearHistory, removeEntry } = useSearchHistory();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
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
    cancelSearch,
  } = useSongLookup();

  // Auto-search from URL ?q= parameter (run once on mount)
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

  const handleShare = async () => {
    const url = `${window.location.origin}?q=${encodeURIComponent(lastSearchQuery)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      toast({ title: "Link copied!", description: "Share this link to show these credits." });
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShareCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const handleSearch = async (query: string) => {
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
          toast({
            title: "Playlist detected",
            description: playlistResult.message || `Track listing not available for this playlist. Try a Deezer playlist for full track access.`,
            variant: "default",
          });
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
          toast({
            title: "Album detected",
            description: `Track listing not available for this platform. Please paste a direct track link instead.`,
            variant: "default",
          });
          setIsCheckingLink(false);
          return;
        }
      }
    } catch (error) {
      console.error('Link check error:', error);
    }

    setIsCheckingLink(false);
    await performSongLookup(query, selectedRegions, undefined, addEntry);
  };

  const handleTrackSelect = async (track: AlbumTrack | PlaylistTrack) => {
    setLoadingTrackId(track.id);
    const searchQuery = `${track.artist} - ${track.title}`;
    await performSongLookup(searchQuery, selectedRegions);
    setAlbumData(null);
    setPlaylistData(null);
    setLoadingTrackId(undefined);
  };

  const runBatchLookup = async (tracks: { id: string; title: string; artist: string }[], onDone: () => void) => {
    const results: TrackCredits[] = [];
    const completed: string[] = [];
    const CONCURRENCY = 3;

    for (let i = 0; i < tracks.length; i += CONCURRENCY) {
      const batch = tracks.slice(i, i + CONCURRENCY);
      setLoadingTrackId(batch[0].id);

      const batchResults = await Promise.allSettled(
        batch.map(track =>
          performSongLookup(`${track.artist} - ${track.title}`, selectedRegions, {
            id: track.id,
            title: track.title,
            artist: track.artist,
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
      toast({
        title: "Batch lookup complete",
        description: `Found credits for ${results.length} of ${tracks.length} tracks.`,
      });
    }
  };

  const handleAlbumBatchLookup = (tracks: AlbumTrack[]) =>
    runBatchLookup(tracks, () => setAlbumData(null));

  const handleBatchLookup = (tracks: PlaylistTrack[]) =>
    runBatchLookup(tracks, () => setPlaylistData(null));

  const handleCancelSelection = () => {
    setAlbumData(null);
    setPlaylistData(null);
    setCompletedTrackIds([]);
  };

  const handleCloseBatchResults = () => {
    setShowBatchResults(false);
    setBatchCredits([]);
    setCompletedTrackIds([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-20">
          <div className="container py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Disc3 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground">PubCheck</h1>
                  <p className="text-xs text-muted-foreground">Publishing Rights Lookup</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {user && (
                  <Button variant="ghost" size="sm" className="relative" onClick={() => setShowFavorites(!showFavorites)}>
                    <Heart className="w-4 h-4 mr-2" />
                    Favorites
                    {alerts.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                        {alerts.length}
                      </span>
                    )}
                  </Button>
                )}
                {user ? (
                  <Button variant="outline" size="sm" onClick={signOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/auth">
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container py-12">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Check Publishing Rights
              <span className="text-gradient-primary"> Instantly</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Paste any song link or search by name to discover who's signed, who's not, and who controls the rights.
            </p>
          </div>

          {/* Search with Filter */}
          <div className="mb-12 space-y-4">
            <SearchBar onSearch={handleSearch} onCancel={() => { cancelSearch(); setIsCheckingLink(false); }} isLoading={isLoading || isCheckingLink} />
            <div className="flex justify-center">
              <RegionFilter selectedRegions={selectedRegions} onRegionsChange={setSelectedRegions} />
            </div>
          </div>

          {/* Favorites Tab */}
          {showFavorites && user && (
            <div className="mb-8">
              <FavoritesTab onClose={() => setShowFavorites(false)} />
            </div>
          )}

          {/* Batch Credits Results */}
          {showBatchResults && batchCredits.length > 0 && (
            <BatchCreditsDisplay tracksCredits={batchCredits} onClose={handleCloseBatchResults} />
          )}

          {/* Playlist Track Selector */}
          {playlistData && !isLoading && !showBatchResults && (
            <PlaylistTrackSelector
              playlist={playlistData}
              onSelectTrack={handleTrackSelect}
              onBatchLookup={handleBatchLookup}
              onCancel={handleCancelSelection}
              isLoading={isLoading}
              loadingTrackId={loadingTrackId}
              completedTrackIds={completedTrackIds}
            />
          )}

          {/* Album Track Selector */}
          {albumData && !showBatchResults && (
            <AlbumTrackSelector
              album={albumData}
              onSelectTrack={handleTrackSelect}
              onBatchLookup={handleAlbumBatchLookup}
              onCancel={handleCancelSelection}
              isLoading={isLoading}
              loadingTrackId={loadingTrackId}
              completedTrackIds={completedTrackIds}
            />
          )}

          {/* Results */}
          {hasSearched && !isLoading && !albumData && !playlistData && !showBatchResults && songData && (
            <div className="max-w-3xl mx-auto space-y-6">
              <SongCard
                title={songData.title}
                artist={songData.artist}
                album={songData.album || "Unknown Album"}
                coverUrl={songData.coverUrl || undefined}
                releaseDate={songData.releaseDate || undefined}
                sourceUrl={lastSearchQuery.startsWith('http') ? lastSearchQuery : undefined}
                dataSource={dataSource}
                recordLabel={songData.recordLabel || undefined}
              />
              <div className="space-y-3">
                <StatsBar credits={credits} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    {sharecopied ? <Check className="w-4 h-4 mr-1.5" /> : <Share2 className="w-4 h-4 mr-1.5" />}
                    {sharecopied ? "Copied!" : "Share"}
                  </Button>
                  <CreditsExport
                    credits={credits}
                    songTitle={songData.title}
                    artist={songData.artist}
                    album={songData.album || undefined}
                  />
                </div>
              </div>
              <CreditsSection
                credits={credits}
                isLoadingPro={isLoadingPro}
                proError={proError}
                onRetryPro={() => handleRetryPro(selectedRegions)}
              />
              <CreditsDebugPanel debugSources={debugSources} dataSource={dataSource} />
              {sources.length > 0 && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Searched: {sources.join(', ')}
                </p>
              )}
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

          {/* Checking Link State */}
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
              {history.length > 0 && (
                <SearchHistory
                  history={history}
                  onSelect={(q) => handleSearch(q)}
                  onRemove={removeEntry}
                  onClear={clearHistory}
                />
              )}
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                  <Disc3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                  Ready to Search
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Paste a song, album, or playlist link to see publishing information from worldwide PROs.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="container py-6 text-center text-sm text-muted-foreground">
            <p>Data sourced from MusicBrainz + public PRO registries worldwide</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
