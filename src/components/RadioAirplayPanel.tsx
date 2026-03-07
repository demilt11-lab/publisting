import { useState, useEffect, memo } from "react";
import { Radio, ChevronDown, ChevronUp, Loader2, ExternalLink, AlertCircle } from "lucide-react";
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
  source?: string;
}

export const RadioAirplayPanel = memo(({ songTitle, artist }: RadioAirplayPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Reset when song changes
    setStations([]);
    setHasLoaded(false);
    setError(null);
    setIsOpen(false);
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
    } catch (e) {
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
              <span className="text-sm">Searching radio stations...</span>
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
              <p className="text-xs text-muted-foreground/70 mt-1">Radio data is sourced from public charting databases.</p>
            </div>
          )}

          {stations.length > 0 && (
            <div className="rounded-xl glass overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 p-3 border-b border-border/50 text-xs font-semibold text-muted-foreground">
                <span>Station</span>
                <span>Market</span>
                <span>Format</span>
                <span>Spins</span>
              </div>
              {stations.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 p-3 border-b border-border/30 last:border-b-0 text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-medium text-foreground">{s.station}</span>
                  <span className="text-muted-foreground text-xs">{s.market || '—'}</span>
                  <span className="text-muted-foreground text-xs">{s.format || '—'}</span>
                  <span className="text-foreground font-mono text-xs">{s.spins ?? '—'}</span>
                </div>
              ))}
              {stations[0]?.source && (
                <div className="p-2 text-center">
                  <Badge variant="outline" className="text-[10px]">Source: {stations[0].source}</Badge>
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

RadioAirplayPanel.displayName = "RadioAirplayPanel";
