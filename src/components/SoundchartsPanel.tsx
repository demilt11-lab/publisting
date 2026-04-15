import { useState, useEffect } from "react";
import { Music2, TrendingUp, BarChart3, ListMusic, Users, Loader2, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SoundchartsPanelProps {
  artistName: string;
  spotifyId?: string;
}

interface SoundchartsData {
  spotify: {
    monthly_listeners: number | null;
    monthly_listeners_delta_7d: number | null;
    monthly_listeners_delta_pct: number | null;
  };
  social: {
    instagram_followers: number | null;
  };
  playlists: {
    total_playlists: number;
    editorial_playlists: number;
    total_reach: number;
    top_playlists: Array<{ name: string; followers: number; type: string }>;
  };
  charts: {
    current_chart_positions: Array<{ chart: string; position: number; country: string }>;
  };
  fetched_at: string;
}

export function SoundchartsPanel({ artistName, spotifyId }: SoundchartsPanelProps) {
  const [data, setData] = useState<SoundchartsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${SUPABASE_URL}/functions/v1/soundcharts-enrich`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ artist_name: artistName, spotify_id: spotifyId }),
    })
      .then(r => r.json())
      .then(res => {
        if (cancelled) return;
        if (res.success) setData(res.data);
        else setError(res.error || "Failed to fetch");
      })
      .catch(() => { if (!cancelled) setError("Network error"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [artistName, spotifyId]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading Soundcharts data...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  const formatNum = (n: number | null) => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const deltaColor = (pct: number | null) => {
    if (pct == null) return "text-muted-foreground";
    return pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-muted-foreground";
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Soundcharts Analytics
          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">
            {new Date(data.fetched_at).toLocaleDateString()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Streaming Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/10">
            <Music2 className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-400" />
            <p className="text-xs font-bold font-mono">{formatNum(data.spotify.monthly_listeners)}</p>
            <p className="text-[9px] text-muted-foreground">Monthly Listeners</p>
            {data.spotify.monthly_listeners_delta_pct != null && (
              <p className={cn("text-[9px] font-mono", deltaColor(data.spotify.monthly_listeners_delta_pct))}>
                {data.spotify.monthly_listeners_delta_pct > 0 ? "+" : ""}{data.spotify.monthly_listeners_delta_pct}% 7d
              </p>
            )}
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/10">
            <ListMusic className="w-3.5 h-3.5 mx-auto mb-1 text-blue-400" />
            <p className="text-xs font-bold font-mono">{data.playlists.total_playlists}</p>
            <p className="text-[9px] text-muted-foreground">Playlists</p>
            <p className="text-[9px] text-blue-400 font-mono">{data.playlists.editorial_playlists} editorial</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/10">
            <Users className="w-3.5 h-3.5 mx-auto mb-1 text-pink-400" />
            <p className="text-xs font-bold font-mono">{formatNum(data.social.instagram_followers)}</p>
            <p className="text-[9px] text-muted-foreground">IG Followers</p>
          </div>
        </div>

        {/* Playlist Reach */}
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Globe className="w-3 h-3" />
          Total playlist reach: <span className="font-mono text-foreground">{formatNum(data.playlists.total_reach)}</span>
        </div>

        {/* Top Playlists */}
        {data.playlists.top_playlists.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Top Playlists</p>
            <ScrollArea className="max-h-24">
              <div className="space-y-1">
                {data.playlists.top_playlists.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={cn("text-[8px] px-1 py-0 shrink-0",
                      p.type === "editorial" ? "border-emerald-500/30 text-emerald-400" : "border-border"
                    )}>
                      {p.type}
                    </Badge>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="font-mono text-muted-foreground shrink-0">{formatNum(p.followers)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Chart Positions */}
        {data.charts.current_chart_positions.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Current Chart Positions</p>
            <div className="flex flex-wrap gap-1">
              {data.charts.current_chart_positions.map((c, i) => (
                <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">
                  #{c.position} {c.chart} ({c.country})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
