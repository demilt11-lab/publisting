import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, ChevronDown, ChevronUp, Trophy, Music, Headphones, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lookupChartPlacements, ChartPlacement } from "@/lib/api/chartLookup";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ChartPlacementsProps {
  songTitle: string;
  artist: string;
}

const chartIcons: Record<string, typeof BarChart3> = {
  "Billboard Hot 100": Trophy,
  "Spotify Charts": Music,
  "Apple Music": Headphones,
  "Shazam": Radio,
};

const chartColors: Record<string, string> = {
  "Billboard Hot 100": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Spotify Charts": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Apple Music": "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "Shazam": "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

// Short labels for badges
const chartShortNames: Record<string, string> = {
  "Billboard Hot 100": "Billboard",
  "Spotify Charts": "Spotify",
  "Apple Music": "Apple",
  "Shazam": "Shazam",
};

export const ChartBadges = ({ songTitle, artist, onDataLoaded }: ChartPlacementsProps & { onDataLoaded?: (placements: ChartPlacement[]) => void }) => {
  const [placements, setPlacements] = useState<ChartPlacement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setPlacements([]);

    lookupChartPlacements(songTitle, artist).then(result => {
      if (cancelled) return;
      if (result.success && result.data?.placements.length) {
        setPlacements(result.data.placements);
        onDataLoaded?.(result.data.placements);
      } else {
        onDataLoaded?.([]);
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [songTitle, artist]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
        <span className="text-xs text-muted-foreground animate-pulse">Charts...</span>
      </div>
    );
  }

  if (placements.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {placements.map(p => {
        const Icon = chartIcons[p.chart] || BarChart3;
        const colors = chartColors[p.chart] || "bg-muted text-muted-foreground border-border";
        const shortName = chartShortNames[p.chart] || p.chart;
        return (
          <Badge
            key={p.chart}
            variant="outline"
            className={`text-xs font-semibold ${colors} flex items-center gap-1`}
            title={`${p.chart}: Peak #${p.peakPosition}${p.weeksOnChart ? ` (${p.weeksOnChart} weeks)` : ''}`}
          >
            <Icon className="w-3 h-3" />
            {shortName} #{p.peakPosition}
          </Badge>
        );
      })}
    </div>
  );
};

export const ChartDetailsSection = ({ placements }: { placements: ChartPlacement[] }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (placements.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50 hover:border-primary/30"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TrendingUp className="w-4 h-4 text-primary" />
            Chart Placements ({placements.length})
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {placements.map(p => {
            const Icon = chartIcons[p.chart] || BarChart3;
            const colors = chartColors[p.chart] || "bg-muted text-muted-foreground border-border";
            return (
              <div key={p.chart} className="flex items-center gap-4 p-4 rounded-xl glass">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.split(' ')[0]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{p.chart}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.source && `Source: ${p.source}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold text-foreground">#{p.peakPosition}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.weeksOnChart ? `${p.weeksOnChart} weeks` : 'Peak'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
