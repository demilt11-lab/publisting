import { memo, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { LineChart as LineIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchLookupSnapshots, LookupSnapshot } from "@/lib/api/lookupIntelligence";

interface Props {
  trackKey: string;
  title?: string;
}

type Series = "spotify_popularity" | "spotify_stream_count" | "youtube_view_count" | "genius_pageviews" | "shazam_count" | "confidence_score";

const SERIES: Array<{ key: Series; label: string; color: string; transform?: (v: number | null) => number | null }> = [
  { key: "spotify_popularity", label: "Spotify pop", color: "hsl(160 84% 50%)" },
  { key: "spotify_stream_count", label: "Spotify streams", color: "hsl(140 60% 60%)" },
  { key: "youtube_view_count",  label: "YouTube views",   color: "hsl(0 80% 60%)" },
  { key: "genius_pageviews",    label: "Genius pv",       color: "hsl(48 90% 60%)" },
  { key: "shazam_count",        label: "Shazam tags",     color: "hsl(220 80% 65%)" },
  { key: "confidence_score",    label: "Confidence",      color: "hsl(190 80% 60%)", transform: (v) => v == null ? null : Math.round(v * 100) },
];

export const LookupTrendChart = memo(({ trackKey, title }: Props) => {
  const [data, setData] = useState<LookupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<Series, boolean>>({
    spotify_popularity: true, spotify_stream_count: false, youtube_view_count: true,
    genius_pageviews: false, shazam_count: false, confidence_score: true,
  });

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchLookupSnapshots(trackKey, 50).then((rows) => {
      if (!cancel) { setData(rows.slice().reverse()); setLoading(false); }
    });
    return () => { cancel = true; };
  }, [trackKey]);

  const chartData = useMemo(() => data.map((s) => {
    const row: Record<string, any> = {
      date: new Date(s.captured_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
    for (const ser of SERIES) {
      const v = s[ser.key as keyof LookupSnapshot] as number | null;
      row[ser.key] = ser.transform ? ser.transform(v) : v;
    }
    return row;
  }), [data]);

  if (loading) {
    return (
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading trends…
        </div>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="glass rounded-xl p-4 text-xs text-muted-foreground italic">
        Trend chart appears once at least 2 snapshots exist for this track.
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <LineIcon className="w-4 h-4 text-primary" />
          Trend History {title && <span className="text-xs text-muted-foreground font-normal">· {title}</span>}
        </h4>
        <div className="flex flex-wrap gap-1">
          {SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => setEnabled((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              className="px-2 py-0.5 text-[10px] rounded border border-border/40 transition-opacity"
              style={{
                color: enabled[s.key] ? s.color : "hsl(var(--muted-foreground))",
                opacity: enabled[s.key] ? 1 : 0.45,
                borderColor: enabled[s.key] ? s.color : undefined,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {SERIES.filter((s) => enabled[s.key]).map((s) => (
              <Line
                key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={1.5} dot={false} connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{data.length} snapshots</Badge>
        <span className="text-[10px] text-muted-foreground">
          {new Date(data[0].captured_at).toLocaleDateString()} → {new Date(data[data.length - 1].captured_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
});
LookupTrendChart.displayName = "LookupTrendChart";