import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Youtube, ExternalLink, Eye, DollarSign, Film, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TopVideo {
  title: string;
  url: string;
  views: number;
  channel: string;
}

interface ContentIDData {
  video_count: number;
  total_views: number;
  estimated_revenue: number;
  claim_count: number;
  top_videos: TopVideo[];
}

interface YouTubeContentIDPanelProps {
  songTitle: string;
  songArtist: string;
}

export const YouTubeContentIDPanel = ({ songTitle, songArtist }: YouTubeContentIDPanelProps) => {
  const [data, setData] = useState<ContentIDData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!songTitle || !songArtist) return;
    setIsLoading(true);
    setError(null);

    try {
      const cacheKey = `yt_cid_${songTitle.toLowerCase()}_${songArtist.toLowerCase()}`.replace(/\s+/g, "_");

      // Check cache first
      const { data: cached } = await supabase
        .from("youtube_content_id")
        .select("*")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        setData({
          video_count: cached.video_count ?? 0,
          total_views: Number(cached.total_views ?? 0),
          estimated_revenue: Number(cached.estimated_revenue ?? 0),
          claim_count: cached.claim_count ?? 0,
          top_videos: (cached.top_videos as TopVideo[]) || [],
        });
        setIsLoading(false);
        return;
      }

      // Call edge function
      const { data: result, error: fnErr } = await supabase.functions.invoke("youtube-content-id", {
        body: { songTitle, songArtist },
      });

      if (fnErr) throw fnErr;
      if (result) {
        setData(result);
      }
    } catch (e: any) {
      setError("Could not load YouTube data");
      console.warn("YouTube Content ID fetch failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [songTitle, songArtist]);

  const formatViews = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatRevenue = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  if (!data && !isLoading && !error) return null;

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Youtube className="h-4 w-4 text-red-500" />
            YouTube Content ID
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchData} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Searching YouTube...</p>
        ) : error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-card border border-border/30">
                <Film className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold text-foreground">{formatViews(data.video_count)}</p>
                <p className="text-[10px] text-muted-foreground">Videos</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-card border border-border/30">
                <Eye className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold text-foreground">{formatViews(data.total_views)}</p>
                <p className="text-[10px] text-muted-foreground">Total Views</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-card border border-border/30">
                <DollarSign className="h-3.5 w-3.5 mx-auto text-emerald-400 mb-1" />
                <p className="text-lg font-bold text-emerald-400">{formatRevenue(data.estimated_revenue)}</p>
                <p className="text-[10px] text-muted-foreground">Est. Revenue</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-card border border-border/30">
                <Youtube className="h-3.5 w-3.5 mx-auto text-red-400 mb-1" />
                <p className="text-lg font-bold text-foreground">{data.claim_count}</p>
                <p className="text-[10px] text-muted-foreground">Claims</p>
              </div>
            </div>

            {data.top_videos.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Top Videos</p>
                <div className="space-y-1.5">
                  {data.top_videos.slice(0, 5).map((video, i) => (
                    <a
                      key={i}
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors text-xs group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate">{video.title}</p>
                        <p className="text-muted-foreground">{video.channel}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-muted-foreground">{formatViews(video.views)}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
