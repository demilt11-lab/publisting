import { useState } from "react";
import { Disc3 } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { SongCard } from "@/components/SongCard";
import { CreditsSection, Credit } from "@/components/CreditsSection";
import { StatsBar } from "@/components/StatsBar";
import demoCover from "@/assets/demo-cover.jpg";

// Mock data for demonstration
const mockSongData = {
  title: "Blinding Lights",
  artist: "The Weeknd",
  album: "After Hours",
  releaseDate: "November 29, 2019",
  coverUrl: demoCover,
};

const mockCredits: Credit[] = [
  { name: "The Weeknd", role: "artist", publishingStatus: "signed", publisher: "Universal Music Publishing", ipi: "00743628910" },
  { name: "Abel Tesfaye", role: "writer", publishingStatus: "signed", publisher: "Universal Music Publishing", ipi: "00743628910" },
  { name: "Max Martin", role: "writer", publishingStatus: "signed", publisher: "MXM Music AB", ipi: "00229567123" },
  { name: "Oscar Holter", role: "writer", publishingStatus: "signed", publisher: "Wolf Cousins", ipi: "00567823401" },
  { name: "Ahmad Balshe", role: "writer", publishingStatus: "unsigned" },
  { name: "Max Martin", role: "producer", publishingStatus: "signed", publisher: "MXM Music AB" },
  { name: "Oscar Holter", role: "producer", publishingStatus: "signed", publisher: "Wolf Cousins" },
  { name: "The Weeknd", role: "producer", publishingStatus: "signed", publisher: "Universal Music Publishing" },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (query: string) => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setHasSearched(true);
    }, 1500);
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
              Paste any song link and discover who's signed, who's not, and who controls the rights.
            </p>
          </div>

          {/* Search */}
          <div className="mb-12">
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </div>

          {/* Results */}
          {hasSearched && !isLoading && (
            <div className="max-w-3xl mx-auto space-y-6">
              <SongCard {...mockSongData} />
              <StatsBar credits={mockCredits} />
              <CreditsSection credits={mockCredits} />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
                  <Disc3 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground">Fetching song data and publishing info...</p>
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
                  Paste a song link from any major streaming platform to see detailed publishing information for all credited artists, writers, and producers.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="container py-6 text-center text-sm text-muted-foreground">
            <p>Data sourced from public registries (ASCAP, BMI, SESAC, PRS, GEMA)</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
