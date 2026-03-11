import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Music, RefreshCw, User, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Favorite } from "@/hooks/useFavorites";

interface Recommendation {
  title: string;
  artist: string;
  reason: string;
  unsigned_talent: string;
  talent_role: string;
  genre: string;
}

interface CachedRecommendations {
  recommendations: Recommendation[];
  timestamp: number;
}

const CACHE_KEY = "pubcheck-recommendations";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadCache(): CachedRecommendations | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedRecommendations = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(recommendations: Recommendation[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ recommendations, timestamp: Date.now() }));
}

interface SongRecommendationsProps {
  history: SearchHistoryEntry[];
  favorites: Favorite[];
  onSearch: (query: string) => void;
}

export const SongRecommendations = ({ history, favorites, onSearch }: SongRecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>(() => {
    return loadCache()?.recommendations || [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchRecommendations = useCallback(async (force = false) => {
    if (history.length === 0 && favorites.length === 0) return;

    // Check cache unless forced
    if (!force) {
      const cached = loadCache();
      if (cached && cached.recommendations.length > 0) {
        setRecommendations(cached.recommendations);
        setHasFetched(true);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("song-recommendations", {
        body: {
          searchHistory: history.slice(0, 20).map(h => ({
            title: h.title,
            artist: h.artist,
            signedCount: h.signedCount,
            totalCount: h.totalCount,
          })),
          favorites: favorites.map(f => ({
            name: f.name,
            role: f.role,
            publisher: f.publisher,
            pro: f.pro,
          })),
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.success && data.data) {
        setRecommendations(data.data);
        saveCache(data.data);
      } else {
        setError(data?.error || "Failed to get recommendations");
      }
    } catch (e) {
      console.error("Recommendations error:", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [history, favorites]);

  // Auto-fetch on mount — uses cache if valid
  useEffect(() => {
    if (!hasFetched && (history.length > 0 || favorites.length > 0)) {
      fetchRecommendations(false);
    }
  }, [hasFetched, history.length, favorites.length, fetchRecommendations]);

  if (history.length === 0 && favorites.length === 0) return null;

  const roleColor = (role: string) => {
    switch (role) {
      case "writer": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "producer": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-secondary-foreground">
            Recommended for You
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={() => fetchRecommendations(true)}
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && recommendations.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing your patterns to find unsigned talent...</p>
        </div>
      ) : error && recommendations.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchRecommendations(true)}>
            Try Again
          </Button>
        </div>
      ) : recommendations.length > 0 ? (
        <div className="space-y-2 relative">
          {loading && (
            <div className="absolute inset-0 bg-background/50 rounded-xl flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          {recommendations.map((rec, idx) => (
            <button
              key={idx}
              onClick={() => onSearch(`${rec.artist} - ${rec.title}`)}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/50 hover:border-primary/20 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Music className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{rec.title}</p>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${roleColor(rec.talent_role)}`}>
                    {rec.genre}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{rec.artist}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                  <User className="w-3 h-3" />
                  <span className="text-primary font-medium">{rec.unsigned_talent}</span>
                  <span>· unsigned {rec.talent_role}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/70 line-clamp-2">{rec.reason}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
