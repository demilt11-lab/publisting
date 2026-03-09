import { useState, useEffect, useMemo, memo } from "react";
import { Radio, ChevronDown, ChevronUp, Loader2, AlertCircle, TrendingUp, Filter, Clock, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useSystemStatus } from "@/contexts/SystemStatusContext";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { GapsMessage } from "@/components/ui/gaps-message";
import { calculateRadioConfidence, detectRadioGaps } from "@/lib/confidence";

interface RadioAirplayPanelProps {
  songTitle: string;
  artist: string;
}

interface RadioStation {
  station: string;
  market?: string;
  format?: string;
  spins?: number;
  rank?: number;
  source?: string;
}

const FORMAT_COLORS: Record<string, string> = {
  "CHR/Pop": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Urban": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Country": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Hot AC": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Rhythmic": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Adult Contemporary": "bg-sky-500/20 text-sky-400 border-sky-500/30",
  "Rock": "bg-red-500/20 text-red-400 border-red-500/30",
  "Alternative": "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Latin": "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const getFormatStyle = (format: string): string => {
  return FORMAT_COLORS[format] || "bg-muted text-muted-foreground border-border";
};

export const RadioAirplayPanel = memo(({ songTitle, artist }: RadioAirplayPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeFormat, setActiveFormat] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    setStations([]);
    setHasLoaded(false);
    setError(null);
    setIsOpen(false);
    setActiveFormat(null);
    setFetchedAt(null);
  }, [songTitle, artist]);

  const { reportDegraded, clearDegraded } = useSystemStatus();

  const loadRadioData = async () => {
    if (hasLoaded || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('radio-airplay-lookup', {
        body: { songTitle, artist },
      });

      if (fnError) {
        setError(fnError.message || 'Failed to load radio data');
        reportDegraded('radio-airplay');
      } else if (data?.success && data?.data?.stations?.length) {
        setStations(data.data.stations);
        setFetchedAt(data.data.fetchedAt || null);
        clearDegraded('radio-airplay');
      } else if (data?.error) {
        setError(data.error);
        reportDegraded('radio-airplay');
      } else {
        setStations([]);
        clearDegraded('radio-airplay');
      }
    } catch {
      setError('Failed to load radio airplay data');
      reportDegraded('radio-airplay');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !hasLoaded) {
      loadRadioData();
    }
  };

  const formats = useMemo(() => {
    const set = new Set<string>();
    stations.forEach(s => { if (s.format) set.add(s.format); });
    return [...set].sort();
  }, [stations]);

  const filteredStations = useMemo(() => {
    const filtered = !activeFormat ? stations : stations.filter(s => s.format === activeFormat);
    // Sort by spins descending by default
    return [...filtered].sort((a, b) => {
      if (a.spins && b.spins) return b.spins - a.spins;
      if (a.spins) return -1;
      if (b.spins) return 1;
      return 0;
    });
  }, [stations, activeFormat]);

  const totalSpins = filteredStations.reduce((sum, s) => sum + (s.spins || 0), 0);

  const hasUsStations = useMemo(() => {
    return stations.some(s => {
      const m = (s.market || '').toLowerCase();
      return m.includes(', ') && /\b[A-Z]{2}\b/.test(s.market || '') && !m.includes('australia') && !m.includes('uk') && !m.includes('canada');
    });
  }, [stations]);

  const freshnessLabel = useMemo(() => {
    if (!fetchedAt) return null;
    const d = new Date(fetchedAt);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [fetchedAt]);

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50 hover:border-primary/30"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Radio className="w-4 h-4 text-primary" />
            Radio Airplay
            {stations.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{stations.length} stations</Badge>
            )}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Searching Mediabase, Billboard & Luminate...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex items-center gap-2 p-4 rounded-xl glass text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => { setHasLoaded(false); loadRadioData(); }}>
                Retry
              </Button>
            </div>
          )}

          {hasLoaded && !isLoading && !error && stations.length === 0 && (
            <div className="p-4 rounded-xl glass text-center">
              <p className="text-sm text-muted-foreground">No radio airplay data found for this song.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Data sourced from Mediabase, Billboard & Luminate.</p>
            </div>
          )}

          {stations.length > 0 && (
            <div className="rounded-xl glass overflow-hidden">
              {/* Total Spins Badge + Freshness */}
              <div className="flex items-center justify-between p-3 border-b border-border/50 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {totalSpins > 0 && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-sm font-bold px-3 py-1">
                      <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                      Total Spins: {totalSpins.toLocaleString()}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {filteredStations.length} station{filteredStations.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {!hasUsStations && stations.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400">
                      <Globe className="w-3 h-3" />
                      No US stations found — showing international data
                    </span>
                  )}
                  {freshnessLabel && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <Clock className="w-3 h-3" />
                      Data as of {freshnessLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Format filter chips with colors */}
              {formats.length > 1 && (
                <div className="flex items-center gap-1.5 p-3 border-b border-border/50 flex-wrap">
                  <Filter className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <Button
                    variant={activeFormat === null ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px] px-2 rounded-full"
                    onClick={() => setActiveFormat(null)}
                  >
                    All ({stations.length})
                  </Button>
                  {formats.map(f => {
                    const count = stations.filter(s => s.format === f).length;
                    const colorClass = activeFormat === f ? "" : getFormatStyle(f);
                    return (
                      <Button
                        key={f}
                        variant={activeFormat === f ? "default" : "outline"}
                        size="sm"
                        className={`h-6 text-[10px] px-2 rounded-full ${activeFormat !== f ? colorClass : ''}`}
                        onClick={() => setActiveFormat(activeFormat === f ? null : f)}
                      >
                        {f} ({count})
                      </Button>
                    );
                  })}
                </div>
              )}

              {/* Station grid header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 p-3 border-b border-border/50 text-xs font-semibold text-muted-foreground">
                <span>Station</span>
                <span>Market</span>
                <span>Format</span>
                <span>Rank</span>
                <span>Spins</span>
              </div>

              {/* Station rows */}
              {filteredStations.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 p-3 border-b border-border/30 last:border-b-0 text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-medium text-foreground">{s.station}</span>
                  <span className="text-muted-foreground text-xs max-w-[120px] truncate">{s.market || '—'}</span>
                  <span>
                    {s.format ? (
                      <Badge variant="outline" className={`text-[10px] ${getFormatStyle(s.format)}`}>
                        {s.format}
                      </Badge>
                    ) : '—'}
                  </span>
                  <span className="text-foreground font-mono text-xs">
                    {s.rank ? (
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3 text-primary" />
                        #{s.rank}
                      </span>
                    ) : '—'}
                  </span>
                  <span className="text-foreground font-mono text-xs font-semibold">{s.spins?.toLocaleString() ?? '—'}</span>
                </div>
              ))}

              {/* Footer */}
              <div className="p-2 flex items-center justify-between text-[10px] text-muted-foreground/70 px-3">
                <span>Sources: {[...new Set(filteredStations.map(s => s.source).filter(Boolean))].join(', ') || 'Web'}</span>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

RadioAirplayPanel.displayName = "RadioAirplayPanel";
