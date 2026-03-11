import { memo } from "react";
import { Music, RotateCw } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { QuickGuide } from "@/components/QuickGuide";
import { TrendingSongs } from "@/components/TrendingSongs";
import { AdvancedToolsPanel } from "@/components/AdvancedToolsPanel";
import { SongResultCard } from "./SongResultCard";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Deal } from "@/components/DealsTracker";
import { SearchFilters } from "@/components/AdvancedFilters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecentSearch {
  query: string;
  title: string;
  artist: string;
  coverUrl?: string;
  signedCount?: number;
  totalCount?: number;
  signingStatus?: "high" | "medium" | "low";
}

interface SearchResult {
  title: string;
  artist: string;
  coverUrl?: string;
  signingStatus?: "high" | "medium" | "low";
  publishingMix?: "indie" | "mixed" | "major";
  labelType?: "indie" | "major";
  writersCount?: number;
  publishersCount?: number;
  hasProData?: boolean;
}

interface CenterPanelProps {
  // Search state
  onSearch: (query: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  recentSearches: {query: string;title: string;artist: string;}[];

  // History & filters
  history: SearchHistoryEntry[];
  deals: Deal[];
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;

  // Results
  hasSearched: boolean;
  searchResults?: SearchResult[];
  selectedResultIndex?: number;
  onSelectResult?: (index: number) => void;

  // Quick searches
  quickSearches?: {title: string;artist: string;}[];
}

const QUICK_SEARCHES = [
{ title: "Blinding Lights", artist: "The Weeknd" },
{ title: "Shape of You", artist: "Ed Sheeran" },
{ title: "Happy", artist: "Pharrell Williams" }];


export const CenterPanel = memo(({
  onSearch,
  onCancel,
  isLoading,
  recentSearches,
  history,
  deals,
  filters,
  onFiltersChange,
  selectedRegions,
  onRegionsChange,
  hasSearched,
  searchResults,
  selectedResultIndex,
  onSelectResult,
  quickSearches = QUICK_SEARCHES
}: CenterPanelProps) => {
  // Format recent searches for display
  const recentSearchCards = history.slice(0, 8).map((h) => ({
    query: h.query,
    title: h.title,
    artist: h.artist,
    coverUrl: h.coverUrl,
    signedCount: h.signedCount,
    totalCount: h.totalCount,
    signingStatus: h.signedCount && h.totalCount && h.signedCount / h.totalCount >= 0.8 ? "high" as const :
    h.signedCount && h.totalCount && h.signedCount / h.totalCount >= 0.5 ? "medium" as const : "low" as const
  }));

  return (
    <div className="h-full flex flex-col">
      {/* Search header */}
      <div className="p-6 pb-4 space-y-4 border-b border-border/50">
        {/* Mission line */}
        <p className="text-muted-foreground text-center text-3xl">
          Find who wrote it, who is signed, and what they've done       
        </p>

        {/* Search bar */}
        <SearchBar
          onSearch={onSearch}
          onCancel={onCancel}
          isLoading={isLoading}
          recentSearches={recentSearches} />
        

        {/* Compact 3-step guide */}
        {!hasSearched && <QuickGuide />}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Show search results if available */}
        {hasSearched && searchResults && searchResults.length > 0 &&
        <div className="space-y-3">
            <h3 className="section-label text-secondary-foreground">Search Results</h3>
            <div className="space-y-2">
              {searchResults.map((result, idx) =>
            <SongResultCard
              key={idx}
              title={result.title}
              artist={result.artist}
              coverUrl={result.coverUrl}
              dealability={result.signingStatus}
              publishingMix={result.publishingMix}
              labelType={result.labelType}
              writersCount={result.writersCount}
              publishersCount={result.publishersCount}
              hasProData={result.hasProData}
              isSelected={selectedResultIndex === idx}
              onClick={() => onSelectResult?.(idx)} />

            )}
            </div>
          </div>
        }

        {/* Home state content */}
        {!hasSearched &&
        <>
            {/* Advanced filters (collapsed by default) */}
            <AdvancedToolsPanel
            history={history}
            deals={deals}
            filters={filters}
            onFiltersChange={onFiltersChange}
            selectedRegions={selectedRegions}
            onRegionsChange={onRegionsChange} />
          

            {/* Recent searches */}
            {recentSearchCards.length > 0 ?
          <div className="space-y-3">
                <h3 className="section-label text-secondary-foreground">Recent Searches</h3>
                <div className="space-y-2">
                  {recentSearchCards.map((search, idx) =>
              <button
                key={idx}
                onClick={() => onSearch(search.query)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-surface hover:bg-surface-elevated hover:border-primary/20 transition-all text-left">
                
                      {search.coverUrl ?
                <img src={search.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover" /> :

                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                          <Music className="w-4 h-4 text-muted-foreground" />
                        </div>
                }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{search.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{search.artist}</p>
                      </div>
                      {search.signedCount !== undefined && search.totalCount && search.totalCount > 0 &&
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${
                  search.signedCount > 0 ?
                  "bg-[#052E16] text-[#16A34A] border-[#14532D]" :
                  "bg-[#451A03] text-[#D97706] border-[#4A2F05]"}`
                  }>
                  
                          {search.signedCount > 0 ? "Signed" : "Unsigned"}
                        </Badge>
                }
                      <RotateCw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
              )}
                </div>
              </div> : (

          /* Quick example searches */
          <div className="space-y-3">
                <h3 className="section-label text-secondary-foreground">Try These</h3>
                <div className="flex flex-wrap gap-2">
                  {quickSearches.map((qs) =>
              <button
                key={qs.title}
                onClick={() => onSearch(`${qs.artist} - ${qs.title}`)}
                className="px-3 py-2 rounded-lg border border-border/50 bg-surface hover:bg-surface-elevated hover:border-primary/30 transition-all text-sm">
                
                      <span className="text-primary font-medium">{qs.title}</span>
                      <span className="text-muted-foreground"> — {qs.artist}</span>
                    </button>
              )}
                </div>
              </div>)
          }

            {/* Trending strip */}
            <div className="pt-4">
              <TrendingSongs onSearch={onSearch} />
            </div>
          </>
        }
      </div>
    </div>);

});

CenterPanel.displayName = "CenterPanel";