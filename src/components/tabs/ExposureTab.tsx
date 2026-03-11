import { memo } from "react";
import { BarChart3, ListMusic, Radio, Trophy, Music, Headphones, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { RadioAirplayPanel } from "@/components/RadioAirplayPanel";
import { PlaylistAppearancesPanel } from "@/components/PlaylistAppearancesPanel";

interface ExposureTabProps {
  songTitle: string;
  artist: string;
  chartPlacements: ChartPlacement[];
}

const chartIcons: Record<string, typeof BarChart3> = {
  "Billboard Hot 100": Trophy,
  "Spotify Charts": Music,
  "Apple Music": Headphones,
  "Shazam": Radio,
};

const chartColors: Record<string, string> = {
  "Billboard Hot 100": "bg-warning/15 text-warning border-warning/25",
  "Spotify Charts": "bg-success/15 text-success border-success/25",
  "Apple Music": "bg-destructive/15 text-destructive border-destructive/25",
  "Shazam": "bg-primary/15 text-primary border-primary/25",
};

export const ExposureTab = memo(({ songTitle, artist, chartPlacements }: ExposureTabProps) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Charts Module */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Chart Placements</h3>
          <Badge variant="outline" className="text-[10px] ml-auto">{chartPlacements.length} chart{chartPlacements.length !== 1 ? "s" : ""}</Badge>
        </div>

        {chartPlacements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No chart data yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                This track hasn't appeared on major charts, or data hasn't been indexed yet. Try another song or check back later.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {chartPlacements.map((cp, i) => {
              const Icon = chartIcons[cp.chart] || BarChart3;
              const colorCls = chartColors[cp.chart] || "bg-secondary text-secondary-foreground border-border";
              return (
                <div key={i} className="rounded-lg border border-border/50 bg-secondary/30 p-3.5 flex items-start gap-3 hover:border-primary/20 transition-colors">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorCls.split(" ")[0]}`}>
                    <Icon className="w-5 h-5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{cp.chart}</p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xl font-bold text-foreground">#{cp.peakPosition || "—"}</span>
                      <span className="text-[10px] text-muted-foreground">peak</span>
                    </div>
                    {cp.weeksOnChart && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{cp.weeksOnChart} weeks on chart</p>
                    )}
                    <div className="mt-2 h-1.5 rounded-full bg-border/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/50"
                        style={{ width: `${Math.max(10, 100 - (cp.peakPosition || 50))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Playlists Module */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Curated Playlists</h3>
        </div>
        <PlaylistAppearancesPanel songTitle={songTitle} artist={artist} />
      </div>

      {/* Radio Module */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Radio Airplay</h3>
        </div>
        <RadioAirplayPanel songTitle={songTitle} artist={artist} />
      </div>
    </div>
  );
});

ExposureTab.displayName = "ExposureTab";
