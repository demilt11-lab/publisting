import { useEffect, useState } from "react";
import { Loader2, Music2, Instagram, ExternalLink, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface BuzzCreator {
  username: string;
  display_name?: string | null;
  url?: string | null;
  views?: number | null;
  likes?: number | null;
}

interface BuzzResult {
  platform: "tiktok" | "instagram";
  total_results: number | null;
  top_creators: BuzzCreator[];
  status: "ok" | "no_data" | "error";
  error?: string;
}

interface SocialBuzzPanelProps {
  songTitle: string;
  artist: string;
}

function formatNum(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function CreatorList({ creators }: { creators: BuzzCreator[] }) {
  if (!creators.length) {
    return <p className="text-xs text-muted-foreground">No creators found.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {creators.map((c, i) => (
        <li key={`${c.username}-${i}`} className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">@{c.username}</span>
            {c.display_name && <span className="text-muted-foreground"> · {c.display_name}</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
            {c.views != null && <span>{formatNum(c.views)} views</span>}
            {c.likes != null && <span>{formatNum(c.likes)} likes</span>}
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SocialBuzzPanel({ songTitle, artist }: SocialBuzzPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiktok, setTiktok] = useState<BuzzResult | null>(null);
  const [instagram, setInstagram] = useState<BuzzResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!songTitle) return;
    setLoading(true);
    setError(null);
    supabase.functions
      .invoke("social-buzz-lookup", { body: { title: songTitle, artist } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message || "Lookup failed");
        } else if (data?.error) {
          setError(data.error);
        } else {
          setTiktok(data?.tiktok || null);
          setInstagram(data?.instagram || null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [songTitle, artist]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Scanning TikTok & Instagram for creators using this track…
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-muted-foreground">Social buzz unavailable: {error}</p>;
  }

  if (!tiktok && !instagram) {
    return <p className="text-xs text-muted-foreground">No social buzz data available.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">TikTok</span>
          <Badge variant="outline" className="text-[10px] ml-auto">
            <TrendingUp className="w-2.5 h-2.5 mr-1" />
            {tiktok?.total_results ?? "—"} videos
          </Badge>
        </div>
        {tiktok?.status === "error" ? (
          <p className="text-xs text-muted-foreground">TikTok lookup failed.</p>
        ) : (
          <CreatorList creators={tiktok?.top_creators || []} />
        )}
      </div>
      <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Instagram className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Instagram</span>
          <Badge variant="outline" className="text-[10px] ml-auto">
            <TrendingUp className="w-2.5 h-2.5 mr-1" />
            {instagram?.total_results ?? "—"} posts
          </Badge>
        </div>
        {instagram?.status === "error" ? (
          <p className="text-xs text-muted-foreground">Instagram lookup failed.</p>
        ) : (
          <CreatorList creators={instagram?.top_creators || []} />
        )}
      </div>
    </div>
  );
}
