import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Music, RefreshCw, User, ChevronRight, CheckCircle2, AlertCircle, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Favorite } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Verification {
  musicbrainz_verified?: boolean;
  mbid?: string;
  mb_country?: string;
  pro_checked?: boolean;
  pro_publisher?: string;
  pro_affiliation?: string;
  confirmed_unsigned?: boolean;
}

interface Recommendation {
  title: string;
  artist: string;
  reason: string;
  unsigned_talent: string;
  talent_role: string;
  genre: string;
  estimated_streams?: string;
  release_year?: string;
  region?: string;
  verification?: Verification;
}

interface CachedRecommendations {
  recommendations: Recommendation[];
  timestamp: number;
}

const CACHE_KEY = "pubcheck-recommendations";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

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
  } catch { return null; }
}

function saveCache(recommendations: Recommendation[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ recommendations, timestamp: Date.now() }));
}

// Build rich profile data from search history
function buildStreamingProfile(history: SearchHistoryEntry[]) {
  const withStreams = history.filter(h => (h as any).streams);
  if (withStreams.length === 0) return undefined;
  const streams = withStreams.map(h => (h as any).streams as number);
  return {
    avgStreams: Math.round(streams.reduce((a, b) => a + b, 0) / streams.length),
    minStreams: Math.min(...streams),
    maxStreams: Math.max(...streams),
    popularityTier: streams.filter(s => s > 10_000_000).length > streams.length / 2 ? "high" : "emerging",
  };
}

function buildSigningProfile(history: SearchHistoryEntry[]) {
  const withCredits = history.filter(h => h.totalCount && h.totalCount > 0);
  if (withCredits.length === 0) return undefined;
  const totalUnsigned = withCredits.reduce((sum, h) => sum + ((h.totalCount || 0) - (h.signedCount || 0)), 0);
  const totalCredits = withCredits.reduce((sum, h) => sum + (h.totalCount || 0), 0);
  return {
    unsignedPercent: Math.round((totalUnsigned / totalCredits) * 100),
    focus: totalUnsigned > totalCredits / 2 ? "unsigned" : "signed",
    publishingMixPreference: "mixed",
  };
}

interface SongRecommendationsProps {
  history: SearchHistoryEntry[];
  favorites: Favorite[];
  onSearch: (query: string) => void;
}

export const SongRecommendations = ({ history, favorites, onSearch }: SongRecommendationsProps) => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Recommendation[]>(() => {
    return loadCache()?.recommendations || [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Track interaction in database
  const trackInteraction = useCallback(async (rec: Recommendation, type: "click" | "dismiss") => {
    if (!user) return;
    try {
      await supabase.from("recommendation_interactions").insert({
        user_id: user.id,
        recommendation_title: rec.title,
        recommendation_artist: rec.artist,
        unsigned_talent: rec.unsigned_talent,
        talent_role: rec.talent_role,
        genre: rec.genre,
        interaction_type: type,
      });
    } catch (e) {
      console.error("Failed to track interaction:", e);
    }
  }, [user]);

  // Load past interactions for AI context
  const loadInteractionHistory = useCallback(async () => {
    if (!user) return undefined;
    try {
      const { data } = await supabase
        .from("recommendation_interactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data || data.length === 0) return undefined;

      return {
        clicked: data
          .filter((d: any) => d.interaction_type === "click")
          .map((d: any) => ({ title: d.recommendation_title, artist: d.recommendation_artist, genre: d.genre, talent_role: d.talent_role })),
        dismissed: data
          .filter((d: any) => d.interaction_type === "dismiss")
          .map((d: any) => ({ title: d.recommendation_title, artist: d.recommendation_artist, genre: d.genre, talent_role: d.talent_role })),
      };
    } catch { return undefined; }
  }, [user]);

  const fetchRecommendations = useCallback(async (force = false) => {
    if (history.length === 0 && favorites.length === 0) return;

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
      const interactionHistory = await loadInteractionHistory();

      const { data, error: fnError } = await supabase.functions.invoke("song-recommendations", {
        body: {
          searchHistory: history.slice(0, 25).map(h => ({
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
            ipi: f.ipi,
          })),
          interactionHistory,
          streamingProfile: buildStreamingProfile(history),
          signingProfile: buildSigningProfile(history),
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.success && data.data) {
        setRecommendations(data.data);
        saveCache(data.data);
        setDismissedIds(new Set());
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
  }, [history, favorites, loadInteractionHistory]);

  useEffect(() => {
    if (!hasFetched && (history.length > 0 || favorites.length > 0)) {
      fetchRecommendations(false);
    }
  }, [hasFetched, history.length, favorites.length, fetchRecommendations]);

  if (history.length === 0 && favorites.length === 0) return null;

  const handleClick = (rec: Recommendation) => {
    trackInteraction(rec, "click");
    onSearch(`${rec.artist} - ${rec.title}`);
  };

  const handleDismiss = (rec: Recommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    trackInteraction(rec, "dismiss");
    setDismissedIds(prev => new Set(prev).add(`${rec.title}-${rec.artist}`));
  };

  const visibleRecs = recommendations.filter(
    r => !dismissedIds.has(`${r.title}-${r.artist}`)
  );

  const roleColor = (role: string) => {
    switch (role) {
      case "writer": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "producer": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  const verificationBadge = (v?: Verification) => {
    if (!v) return null;
    if (v.musicbrainz_verified && v.confirmed_unsigned) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> Verified
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            Song found in MusicBrainz. Talent confirmed unsigned via PRO database.
          </TooltipContent>
        </Tooltip>
      );
    }
    if (v.musicbrainz_verified) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20 gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> MB ✓
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            Song verified in MusicBrainz database. PRO status pending verification.
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 gap-0.5">
            <AlertCircle className="w-2.5 h-2.5" /> Unverified
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          Could not verify in MusicBrainz. Song may still exist on streaming platforms.
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-secondary-foreground">
            Recommended for You
          </h3>
          <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50">
            AI + MusicBrainz + PRO
          </Badge>
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
          <p className="text-sm text-muted-foreground">Analyzing patterns & verifying against databases...</p>
        </div>
      ) : error && recommendations.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchRecommendations(true)}>
            Try Again
          </Button>
        </div>
      ) : visibleRecs.length > 0 ? (
        <div className="space-y-2 relative">
          {loading && (
            <div className="absolute inset-0 bg-background/50 rounded-xl flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          {visibleRecs.map((rec, idx) => (
            <div
              key={idx}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-secondary/50 hover:border-primary/20 transition-all text-left group relative"
            >
              {/* Dismiss button */}
              <button
                onClick={(e) => handleDismiss(rec, e)}
                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-secondary"
                aria-label="Not interested"
              >
                <X className="w-3 h-3" />
              </button>

              <button
                onClick={() => handleClick(rec)}
                className="flex items-start gap-3 flex-1 min-w-0 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Music className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{rec.title}</p>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${roleColor(rec.talent_role)}`}>
                      {rec.genre}
                    </Badge>
                    {verificationBadge(rec.verification)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{rec.artist}</span>
                    {rec.release_year && <span>· {rec.release_year}</span>}
                    {rec.estimated_streams && <span>· ~{rec.estimated_streams} streams</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 flex-wrap">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="text-primary font-medium">{rec.unsigned_talent}</span>
                    <span>· unsigned {rec.talent_role}</span>
                    {rec.region && (
                      <>
                        <Globe className="w-3 h-3 shrink-0 ml-1" />
                        <span>{rec.region}</span>
                      </>
                    )}
                    {rec.verification?.pro_affiliation && (
                      <Badge variant="outline" className="text-[9px] ml-1">{rec.verification.pro_affiliation}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 line-clamp-2">{rec.reason}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
