import { memo, useCallback, useMemo, useState } from "react";
import { classifyLabel, classifyPublisher } from "@/lib/labelClassifier";
import { User, Building2, Shield, BarChart3, ListMusic, Radio, TrendingUp, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Credit } from "@/components/CreditsSection";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { cn } from "@/lib/utils";
import { useWatchlist, WatchlistEntityType } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";

interface SummaryTabProps {
  credits: Credit[];
  chartPlacements: ChartPlacement[];
  recordLabel?: string;
  onSwitchTab: (tab: string) => void;
  songTitle?: string;
  songArtist?: string;
  songProjectData?: {
    title: string;
    artist: string;
    writersCount: number;
    publishersCount: number;
    publishingMix: "indie" | "mixed" | "major";
    labelType: "indie" | "major";
    signingStatus: "high" | "medium" | "low";
    recordLabel?: string;
  } | null;
}

const MAJOR_PUBLISHERS_LEGACY = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];

const SIGNING_CONFIG = {
  high: { label: "Mostly Signed", cls: "bg-success/15 text-success border-success/25", desc: "Most writers are signed to publishers" },
  medium: { label: "Partially Signed", cls: "bg-warning/15 text-warning border-warning/25", desc: "Some writers are unsigned" },
  low: { label: "Mostly Unsigned", cls: "bg-destructive/15 text-destructive border-destructive/25", desc: "Many writers appear unsigned" },
};

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export const SummaryTab = memo(({ credits, chartPlacements, recordLabel, onSwitchTab, songTitle, songArtist, songProjectData }: SummaryTabProps) => {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, watchlist } = useWatchlist();
  const { toast } = useToast();

  const handleToggleWatchlist = useCallback((name: string, role: "Artist" | "Writer" | "Producer", pro?: string, publisher?: string) => {
    if (!songTitle || !songArtist) return;
    const watchlistType: WatchlistEntityType = role === "Artist" ? "artist" : role === "Writer" ? "writer" : "producer";
    const isWatched = isInWatchlist(name, watchlistType);
    if (isWatched) {
      const entry = watchlist.find(w => w.name.toLowerCase() === name.toLowerCase() && w.type === watchlistType);
      if (entry) {
        removeFromWatchlist(entry.id);
        toast({ title: "Removed from Watchlist", description: `${name} has been removed.` });
      }
    } else {
      const majorPubs = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];
      const isMajor = publisher ? majorPubs.some(m => publisher.toLowerCase().includes(m)) : false;
      addToWatchlist(name, watchlistType, { songTitle, artist: songArtist }, { pro, isMajor });
      toast({ title: "Added to Watchlist", description: `${name} is now being tracked.` });
    }
  }, [songTitle, songArtist, isInWatchlist, watchlist, removeFromWatchlist, addToWatchlist, toast]);
  const data = useMemo(() => {
    const dedupKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const seenKeys = new Set<string>();
    const dedup = <T extends { name: string }>(arr: T[]): T[] => {
      const result: T[] = [];
      for (const item of arr) {
        const key = dedupKey(item.name);
        if (!seenKeys.has(key)) { seenKeys.add(key); result.push(item); }
      }
      return result;
    };

    const writers = dedup(credits.filter(c => c.role === "writer"));
    const producers = dedup(credits.filter(c => c.role === "producer"));
    const artists = dedup(credits.filter(c => c.role === "artist"));
    const publishers = new Set(credits.filter(c => c.publisher).map(c => c.publisher));
    const pubList = Array.from(publishers);
    const majorCount = pubList.filter(p => classifyPublisher(p!) === 'major').length;
    const topPubNames = pubList.filter(Boolean).slice(0, 2).map(p => p!);
    const publishingMix = majorCount === 0 
      ? (topPubNames.length ? `Indie: ${topPubNames.join(", ")}` : "Mostly indie")
      : majorCount === pubList.length 
      ? (topPubNames.length ? `Major: ${topPubNames.join(", ")}` : "Major publishers")
      : (topPubNames.length ? `Mixed: ${topPubNames.join(", ")}` : "Mixed (indie + major)");
    const labelClassification = classifyLabel(recordLabel) === 'major' ? "Major" : "Indie";
    const labelType = recordLabel ? `${labelClassification}: ${recordLabel}` : `${labelClassification} label`;
    const signedRatio = credits.length > 0 ? credits.filter(c => c.publisher).length / credits.length : 0;
    const signingStatus: "high" | "medium" | "low" = signedRatio >= 0.8 ? "high" : signedRatio >= 0.5 ? "medium" : "low";

    const keyPeopleSeenKeys = new Set<string>();
    const keyPeople = [
      ...artists.slice(0, 3).map(c => ({ name: c.name, role: "Artist" as const, pro: c.pro, publisher: c.publisher, isMajor: c.publisher ? classifyPublisher(c.publisher) === 'major' : false, pubStatus: c.publisher ? "Pub: Signed" : c.pro ? "Pub: Unknown" : "Pub: Unsigned", labelStatus: c.recordLabel ? "Label: Signed" : "Label: Unknown" })),
      ...writers.slice(0, 4).map(c => ({ name: c.name, role: "Writer" as const, pro: c.pro, publisher: c.publisher, isMajor: c.publisher ? classifyPublisher(c.publisher) === 'major' : false, pubStatus: c.publisher ? "Pub: Signed" : c.pro ? "Pub: Unknown" : "Pub: Unsigned", labelStatus: undefined as string | undefined })),
      ...producers.slice(0, 2).map(c => ({ name: c.name, role: "Producer" as const, pro: c.pro, publisher: c.publisher, isMajor: c.publisher ? classifyPublisher(c.publisher) === 'major' : false, pubStatus: c.publisher ? "Pub: Signed" : c.pro ? "Pub: Unknown" : "Pub: Unsigned", labelStatus: undefined as string | undefined })),
    ].filter(p => {
      const key = dedupKey(p.name);
      if (keyPeopleSeenKeys.has(key)) return false;
      keyPeopleSeenKeys.add(key);
      return true;
    });

    const peakChart = chartPlacements.length > 0
      ? { name: chartPlacements[0]?.chart || "Charts", peak: Math.min(...chartPlacements.map(c => c.peakPosition || 100)), count: chartPlacements.length }
      : null;

    return { writers, producers, artists, publishers, pubList, publishingMix, labelType, signingStatus, keyPeople, peakChart, writersCount: writers.length, producersCount: producers.length, publishersCount: publishers.size };
  }, [credits, chartPlacements, recordLabel]);

  const statusConfig = SIGNING_CONFIG[data.signingStatus];

  const roleColors = { Artist: "bg-primary/10 text-primary", Writer: "bg-blue-500/10 text-blue-400", Producer: "bg-purple-500/10 text-purple-400" };
  const pubStatusColors: Record<string, string> = { "Pub: Signed": "bg-success/10 text-success border-success/20", "Pub: Unknown": "bg-warning/10 text-warning border-warning/20", "Pub: Unsigned": "bg-muted text-muted-foreground border-border" };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
      {/* Left column: Key People */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Key People</h3>
          <Badge variant="outline" className={cn("text-[10px]", statusConfig.cls)}>
            <Shield className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>

        <div className="space-y-1.5">
          {data.keyPeople.map((person, i) => {
            const watchlistType: WatchlistEntityType = person.role === "Artist" ? "artist" : person.role === "Writer" ? "writer" : "producer";
            const isWatched = isInWatchlist(person.name, watchlistType);
            return (
            <div key={i} className="relative group/person flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold", roleColors[person.role])}>
                {getInitials(person.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{person.name}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", roleColors[person.role])}>{person.role}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", pubStatusColors[person.pubStatus])}>{person.pubStatus}</Badge>
                  {person.labelStatus && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground border-border">{person.labelStatus}</Badge>}
                  {person.pro && <span className="text-[10px] text-muted-foreground">{person.pro}</span>}
                </div>
              </div>
              {/* Watch button */}
              {songTitle && songArtist && !isWatched && (
                <Button
                  size="sm"
                  onClick={() => handleToggleWatchlist(person.name, person.role, person.pro || undefined, person.publisher || undefined)}
                  className="md:opacity-0 md:group-hover/person:opacity-100 transition-all duration-200 md:scale-90 md:group-hover/person:scale-100 h-7 px-2.5 text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 rounded-full gap-1.5 shrink-0"
                >
                  <Eye className="w-3 h-3" />
                  Watch
                </Button>
              )}
              {songTitle && songArtist && isWatched && (
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-2 py-0.5 gap-1 pointer-events-none shrink-0">
                  <Eye className="w-3 h-3" />
                  Watching
                </Badge>
              )}
            </div>
            );
          })}
        </div>

        <Button variant="ghost" size="sm" className="w-full text-xs text-primary" onClick={() => onSwitchTab("credits")}>
          View all {credits.length} credits →
        </Button>
      </div>

      {/* Right column: Exposure Snapshot */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Exposure Snapshot</h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Chart metric */}
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Charts</span>
            </div>
            {data.peakChart ? (
              <>
                <p className="text-lg font-bold text-foreground">#{data.peakChart.peak}</p>
                <p className="text-[10px] text-muted-foreground">{data.peakChart.name} · {data.peakChart.count} chart{data.peakChart.count > 1 ? "s" : ""}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">No chart data</p>
            )}
          </div>

          {/* Writers metric */}
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Writers</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data.writersCount}</p>
          </div>

          {/* Publishing metric */}
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Publishers</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data.publishersCount}</p>
            {data.pubList.length > 0 && (
              <PublishersList publishers={data.pubList.filter(Boolean) as string[]} />
            )}
          </div>

          {/* Label metric */}
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Label</span>
            </div>
            <p className="text-sm font-bold text-foreground truncate">{recordLabel || "Unknown"}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-xs text-primary" onClick={() => onSwitchTab("exposure")}>
            Full exposure →
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs text-primary" onClick={() => onSwitchTab("contacts")}>
            Find contacts →
          </Button>
        </div>
      </div>
    </div>
  );
});

SummaryTab.displayName = "SummaryTab";
