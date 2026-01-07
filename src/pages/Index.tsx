import { useState } from "react";
import { Disc3 } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
import { CreditsSection, Credit } from "@/components/CreditsSection";
import { StatsBar } from "@/components/StatsBar";
import { lookupSong, SongData, CreditData } from "@/lib/api/songLookup";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const { toast } = useToast();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setHasSearched(false);
    
    try {
      const result = await lookupSong(query);
      
      if (!result.success || !result.data) {
        toast({
          title: "Song not found",
          description: result.error || "Could not find publishing information for this song. Try searching with 'Artist - Song Title'",
          variant: "destructive",
        });
        setHasSearched(false);
        return;
      }

      setSongData(result.data.song);
      setSources(result.data.sources);
      
      // Map API credits to component credits
      const mappedCredits: Credit[] = result.data.credits.map((c: CreditData) => ({
        name: c.name,
        role: c.role,
        publishingStatus: c.publishingStatus,
        publisher: c.publisher,
        ipi: c.ipi,
      }));
      
      setCredits(mappedCredits);
      setHasSearched(true);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Error",
        description: "Failed to search. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
      
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-20">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Disc3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground">PubCheck</h1>
                <p className="text-xs text-muted-foreground">Publishing Rights Lookup</p>
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

          {/* Search */}
          <div className="mb-12">
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </div>

          {/* Results */}
          {hasSearched && !isLoading && songData && (
            <div className="max-w-3xl mx-auto space-y-6">
              <SongCard 
                title={songData.title}
                artist={songData.artist}
                album={songData.album || "Unknown Album"}
                coverUrl={songData.coverUrl || undefined}
                releaseDate={songData.releaseDate || undefined}
              />
              <StatsBar credits={credits} />
              <CreditsSection credits={credits} />
              {sources.length > 0 && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Searched: {sources.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
                  <Disc3 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground">Searching MusicBrainz & PRO databases...</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasSearched && !isLoading && (
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                  <Disc3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                  Ready to Search
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Paste a song link or search "Artist - Song Title" to see publishing information from ASCAP, BMI, SESAC, PRS, GEMA, and The MLC.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="container py-6 text-center text-sm text-muted-foreground">
            <p>Data sourced from MusicBrainz + public PRO registries (ASCAP, BMI, SESAC, PRS, GEMA, The MLC)</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
