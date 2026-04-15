import { useState, useEffect, memo } from "react";
import { Plane, MapPin, Calendar, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface TourData {
  on_tour: boolean;
  upcoming_shows_count: number;
  avg_venue_capacity: number | null;
  touring_regions: string[];
  next_show_date: string | null;
}

interface TouringActivityBadgeProps {
  artistName: string;
  personId?: string;
  compact?: boolean;
}

export const TouringActivityBadge = memo(({ artistName, personId, compact = false }: TouringActivityBadgeProps) => {
  const [data, setData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artistName) return;
    let cancelled = false;
    setLoading(true);

    fetch(`${SUPABASE_URL}/functions/v1/touring-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ artist_name: artistName, person_id: personId }),
    })
      .then(r => r.json())
      .then(res => {
        if (cancelled) return;
        if (res.success) setData(res.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [artistName, personId]);

  if (loading) return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  if (!data || !data.on_tour) return null;

  const nextDate = data.next_show_date
    ? new Date(data.next_show_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 gap-0.5 cursor-default">
              <Plane className="w-2.5 h-2.5" />
              On Tour
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">
            <p className="font-medium">{data.upcoming_shows_count} upcoming shows</p>
            {nextDate && <p>Next: {nextDate}</p>}
            {data.touring_regions.length > 0 && (
              <p>Regions: {data.touring_regions.slice(0, 3).join(", ")}</p>
            )}
            {data.avg_venue_capacity && (
              <p>Avg venue: {data.avg_venue_capacity.toLocaleString()} cap</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
      <Plane className="w-4 h-4 text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-emerald-400">On Tour</p>
        <p className="text-[10px] text-muted-foreground">
          {data.upcoming_shows_count} shows
          {nextDate && <> · Next: {nextDate}</>}
          {data.touring_regions.length > 0 && (
            <> · <MapPin className="w-2.5 h-2.5 inline" /> {data.touring_regions.slice(0, 2).join(", ")}</>
          )}
        </p>
      </div>
    </div>
  );
});

TouringActivityBadge.displayName = "TouringActivityBadge";
