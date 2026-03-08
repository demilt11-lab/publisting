import { useState, useEffect, useMemo, memo } from "react";
import { Radio, ChevronDown, ChevronUp, Loader2, AlertCircle, TrendingUp, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

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

export const RadioAirplayPanel = memo(({ songTitle, artist }: RadioAirplayPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeFormat, setActiveFormat] = useState<string | null>(null);

  useEffect(() => {
    setStations([]);
    setHasLoaded(false);
    setError(null);
    setIsOpen(false);
    setActiveFormat(null);
  }, [songTitle, artist]);

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
      } else if (data?.success && data?.data?.stations?.length) {
        setStations(data.data.stations);
      } else if (data?.error) {
        setError(data.error);
      } else {
        setStations([]);
      }
    } catch {
      setError('Failed to load radio airplay data');
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
    if (!activeFormat) return stations;
    return stations.filter(s => s.format === activeFormat);
  }, [stations, activeFormat]);

  const totalSpins = filteredStations.reduce((sum, s) => sum + (s.spins || 0), 0);

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
            {totalSpins > 0 && (
              <Badge variant="outline" className="text-[10px] text-primary">
                {totalSpins.toLocaleString()} spins
              </Badge>
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
                    return (
                      <Button
                        key={f}
                        variant={activeFormat === f ? "default" : "ghost"}
                        size="sm"
                        className="h-6 text-[10px] px-2 rounded-full"
                        onClick={() => setActiveFormat(activeFormat === f ? null : f)}
                      >
                        {f} ({count})
                      </Button>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 p-3 border-b border-border/50 text-xs font-semibold text-muted-foreground">
                <span>Station</span>
                <span>Market</span>
                <span>Format</span>
                <span>Rank</span>
                <span>Spins</span>
              </div>
              {filteredStations.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 p-3 border-b border-border/30 last:border-b-0 text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-medium text-foreground">{s.station}</span>
                  <span className="text-muted-foreground text-xs max-w-[120px] truncate">{s.market || '—'}</span>
                  <span className="text-muted-foreground text-xs">{s.format || '—'}</span>
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
              <div className="p-2 flex items-center justify-between text-[10px] text-muted-foreground/70 px-3">
                <span>Sources: {[...new Set(filteredStations.map(s => s.source).filter(Boolean))].join(', ') || 'Web'}</span>
                {totalSpins > 0 && <span className="font-semibold text-foreground">Total: {totalSpins.toLocaleString()} spins</span>}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

RadioAirplayPanel.displayName = "RadioAirplayPanel";
