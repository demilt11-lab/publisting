import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Sparkles, Loader2, Music, RefreshCw, User, ChevronRight, CheckCircle2, AlertCircle, X, Globe, ThumbsUp, ThumbsDown, ChevronDown, Brain, MapPin, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Favorite } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

const CACHE_KEY = "publisting-recommendations";
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

// ── Signal analysis for "Why these recommendations?" ──────────
function analyzeSignals(history: SearchHistoryEntry[], favorites: Favorite[]) {
  // Top genres (inferred from artist names — simplified)
  const artistCounts: Record<string, number> = {};
  history.forEach(h => {
    artistCounts[h.artist] = (artistCounts[h.artist] || 0) + 1;
  });
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // Role preferences from favorites
  const roles = { writer: 0, producer: 0, artist: 0 };
  favorites.forEach(f => {
    if (f.role in roles) roles[f.role as keyof typeof roles]++;
  });
  const totalFavs = favorites.length;
  const rolePreference = totalFavs > 0
    ? Object.entries(roles)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `${role}s (${Math.round((count / totalFavs) * 100)}%)`)
    : [];

  // PRO distribution from favorites
  const pros: Record<string, number> = {};
  favorites.forEach(f => {
    if (f.pro) pros[f.pro] = (pros[f.pro] || 0) + 1;
  });
  const topPros = Object.entries(pros)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  // Publisher patterns
  const publishers: Record<string, number> = {};
  favorites.forEach(f => {
    if (f.publisher) publishers[f.publisher] = (publishers[f.publisher] || 0) + 1;
  });
  const topPublishers = Object.entries(publishers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  // Signing profile
  const signingProfile = buildSigningProfile(history);

  return {
    topArtists,
    rolePreference,
    topPros,
    topPublishers,
    searchCount: history.length,
    favoritesCount: favorites.length,
    signingProfile,
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
  const [votedIds, setVotedIds] = useState<Record<string, "up" | "down">>({});
  const [showSignals, setShowSignals] = useState(false);
  const fetchInFlight = useRef(false);

  const signals = useMemo(() => analyzeSignals(history, favorites), [history, favorites]);

  const trackInteraction = useCallback(async (rec: Recommendation, type: "click" | "dismiss" | "thumbs_up" | "thumbs_down") => {
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

      // ML feedback loop: update user profile weights based on vote
      if (type === "thumbs_up" || type === "thumbs_down") {
        const weight = type === "thumbs_up" ? 0.15 : -0.1;
        const { data: profile } = await supabase
          .from("ml_user_profiles")
          .select("genre_weights, region_weights, audio_preferences")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile && rec.genre) {
          const genreWeights = (profile.genre_weights as Record<string, number>) || {};
          const genre = rec.genre.toLowerCase();
          genreWeights[genre] = Math.max(0, Math.min(1, (genreWeights[genre] || 0.5) + weight));

          // Also adjust region weights if available
          const regionWeights = (profile.region_weights as Record<string, number>) || {};
          if (rec.region) {
            regionWeights[rec.region] = Math.max(0, Math.min(1, (regionWeights[rec.region] || 0.5) + weight));
          }

          await supabase.from("ml_user_profiles").update({
            genre_weights: genreWeights,
            region_weights: regionWeights,
            updated_at: new Date().toISOString(),
          }).eq("user_id", user.id);
        }
      }
    } catch (e) {
      console.error("Failed to track interaction:", e);
    }
  }, [user]);

  const loadInteractionHistory = useCallback(async () => {
    if (!user) return undefined;
    try {
      const { data } = await supabase
        .from("recommendation_interactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!data || data.length === 0) return undefined;

      return {
        clicked: data
          .filter((d: any) => d.interaction_type === "click")
          .map((d: any) => ({ title: d.recommendation_title, artist: d.recommendation_artist, genre: d.genre, talent_role: d.talent_role })),
        dismissed: data
          .filter((d: any) => d.interaction_type === "dismiss" || d.interaction_type === "thumbs_down")
          .map((d: any) => ({ title: d.recommendation_title, artist: d.recommendation_artist, genre: d.genre, talent_role: d.talent_role })),
        liked: data
          .filter((d: any) => d.interaction_type === "thumbs_up")
          .map((d: any) => ({ title: d.recommendation_title, artist: d.recommendation_artist, genre: d.genre, talent_role: d.talent_role })),
      };
    } catch { return undefined; }
  }, [user]);

  const loadWatchlistActivity = useCallback(async () => {
    if (!user) return undefined;
    try {
      const { data } = await supabase
        .from("watchlist_entries")
        .select("person_name, person_type, pipeline_status, is_priority, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);

      if (!data || data.length === 0) return undefined;

      return data.map((d: any) => ({
        person_name: d.person_name,
        person_type: d.person_type,
        pipeline_status: d.pipeline_status,
        is_priority: d.is_priority,
      }));
    } catch { return undefined; }
  }, [user]);

  const fetchRecommendations = useCallback(async (force = false) => {
    if (history.length === 0 && favorites.length === 0) return;
    if (fetchInFlight.current) return;

    if (!force) {
      const cached = loadCache();
      if (cached && cached.recommendations.length > 0) {
        setRecommendations(cached.recommendations);
        setHasFetched(true);
        return;
      }
    }

    fetchInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const interactionHistory = await loadInteractionHistory();

      const { data, error: fnError } = await supabase.functions.invoke("song-recommendations", {
        body: {
          searchHistory: history.map(h => ({
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
          watchlistActivity: await loadWatchlistActivity(),
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.success && data.data) {
        setRecommendations(data.data);
        saveCache(data.data);
        setDismissedIds(new Set());
        setVotedIds({});
      } else {
        setError(data?.error || "Failed to get recommendations");
      }
    } catch (e) {
      console.error("Recommendations error:", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      fetchInFlight.current = false;
      setLoading(false);
      setHasFetched(true);
    }
  }, [history, favorites, loadInteractionHistory]);

  useEffect(() => {
    if (!hasFetched && (history.length > 0 || favorites.length > 0)) {
      fetchRecommendations(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFetched, history.length, favorites.length]);

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

  const handleVote = (rec: Recommendation, vote: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    const key = `${rec.title}-${rec.artist}`;
    const currentVote = votedIds[key];

    if (currentVote === vote) {
      // Un-vote
      setVotedIds(prev => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }

    setVotedIds(prev => ({ ...prev, [key]: vote }));
    trackInteraction(rec, vote === "up" ? "thumbs_up" : "thumbs_down");

    // Auto-dismiss on thumbs down after a brief moment
    if (vote === "down") {
      setTimeout(() => {
        setDismissedIds(prev => new Set(prev).add(key));
      }, 600);
    }
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

      {/* ── Why these recommendations? ─────────────────────────── */}
      <Collapsible open={showSignals} onOpenChange={setShowSignals}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/30 bg-card/50 hover:bg-secondary/30 transition-colors text-left">
            <Brain className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] text-muted-foreground flex-1">Why these recommendations?</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showSignals ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-lg border border-border/30 bg-card/50 p-3 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Based on <span className="text-foreground font-medium">your search history</span> and <span className="text-foreground font-medium">{signals.favoritesCount} saved favorites</span>, here's what the AI uses:
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Most searched artists */}
              {signals.topArtists.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <BarChart3 className="w-3 h-3" /> Top Searched
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {signals.topArtists.map(a => (
                      <Badge key={a} variant="outline" className="text-[10px] font-normal">{a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Role preferences */}
              {signals.rolePreference.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <Users className="w-3 h-3" /> Role Focus
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {signals.rolePreference.map(r => (
                      <Badge key={r} variant="outline" className="text-[10px] font-normal">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* PRO affiliations */}
              {signals.topPros.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <MapPin className="w-3 h-3" /> PRO Affiliations
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {signals.topPros.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] font-normal">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Signing focus */}
              {signals.signingProfile && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" /> Signing Focus
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {signals.signingProfile.unsignedPercent}% unsigned credits · Targets <span className="text-foreground">{signals.signingProfile.focus}</span> talent
                  </p>
                </div>
              )}
            </div>

            {/* Publisher patterns */}
            {signals.topPublishers.length > 0 && (
              <div className="pt-1 border-t border-border/20">
                <p className="text-[10px] text-muted-foreground">
                  Common publishers in your searches: {signals.topPublishers.map((p, i) => (
                    <span key={p}>{i > 0 ? ", " : ""}<span className="text-foreground">{p}</span></span>
                  ))}
                </p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/60 italic">
              Thumbs up/down on recommendations helps the AI learn your preferences over time.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
          {visibleRecs.map((rec, idx) => {
            const key = `${rec.title}-${rec.artist}`;
            const vote = votedIds[key];
            return (
              <div
                key={idx}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left group relative ${
                  vote === "up"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : vote === "down"
                    ? "border-destructive/30 bg-destructive/5 opacity-60"
                    : "border-border/50 bg-card hover:bg-secondary/50 hover:border-primary/20"
                }`}
              >
                {/* Thumbs buttons */}
                <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleVote(rec, "up", e)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      vote === "up"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                    aria-label="Thumbs up"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleVote(rec, "down", e)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      vote === "down"
                        ? "bg-destructive/20 text-destructive"
                        : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    }`}
                    aria-label="Thumbs down"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDismiss(rec, e)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                    aria-label="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

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
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
