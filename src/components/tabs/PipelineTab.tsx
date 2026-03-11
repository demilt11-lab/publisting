import { memo, useMemo, useCallback } from "react";
import { User, Pen, Disc3, Building2, GripVertical, BarChart3, ListMusic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWatchlist, WatchlistEntry, ContactStatus, CONTACT_STATUS_CONFIG, WatchlistEntityType } from "@/hooks/useWatchlist";
import { Credit } from "@/components/CreditsSection";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PipelineTabProps {
  songTitle: string;
  songArtist: string;
  credits: Credit[];
}

const TYPE_ICONS: Record<WatchlistEntityType, typeof User> = {
  writer: Pen, producer: Disc3, artist: User, publisher: Building2, label: Disc3,
};

const COLUMN_COLORS: Record<ContactStatus, string> = {
  not_contacted: "border-muted-foreground/30",
  reached_out: "border-blue-500/40",
  in_talks: "border-warning/40",
  signed: "border-success/40",
  passed: "border-destructive/40",
};

export const PipelineTab = memo(({ songTitle, songArtist, credits }: PipelineTabProps) => {
  const { watchlist, addToWatchlist, updateContactStatus } = useWatchlist();
  const { toast } = useToast();

  // Group watchlist entries by status
  const columns = useMemo(() => {
    const cols: Record<ContactStatus, WatchlistEntry[]> = {
      not_contacted: [], reached_out: [], in_talks: [], signed: [], passed: [],
    };
    watchlist.forEach(entry => {
      const status = entry.contactStatus || "not_contacted";
      cols[status].push(entry);
    });
    return cols;
  }, [watchlist]);

  const handleAddCredit = useCallback((credit: Credit) => {
    const type: WatchlistEntityType = credit.role === "writer" ? "writer" : credit.role === "producer" ? "producer" : "artist";
    addToWatchlist({
      name: credit.name,
      type,
      pro: credit.pro,
      ipi: credit.ipi,
      isMajor: credit.publisher ? ["sony", "universal", "warner", "bmg", "kobalt"].some(m => credit.publisher!.toLowerCase().includes(m)) : undefined,
      songTitle,
      artist: songArtist,
    });
    toast({ title: "Added to pipeline", description: `${credit.name} added as Not Contacted.` });
  }, [addToWatchlist, songTitle, songArtist, toast]);

  const handleMoveStatus = useCallback((entryId: string, newStatus: ContactStatus) => {
    updateContactStatus(entryId, newStatus);
  }, [updateContactStatus]);

  const statuses = Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Quick add from credits */}
      {credits.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Add from this song's credits</h3>
          <div className="flex flex-wrap gap-1.5">
            {credits.slice(0, 8).map((c, i) => {
              const isInWatchlist = watchlist.some(w => w.name.toLowerCase() === c.name.toLowerCase());
              return (
                <Button
                  key={i}
                  variant={isInWatchlist ? "secondary" : "outline"}
                  size="sm"
                  className="text-[10px] h-6 gap-1"
                  disabled={isInWatchlist}
                  onClick={() => handleAddCredit(c)}
                >
                  {isInWatchlist ? "✓" : "+"} {c.name}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-[900px]">
          {statuses.map(status => {
            const config = CONTACT_STATUS_CONFIG[status];
            const entries = columns[status];
            return (
              <div key={status} className={cn("flex-1 min-w-[160px] rounded-xl border bg-card/50 p-3 space-y-2", COLUMN_COLORS[status])}>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={cn("text-[10px]", config.color)}>
                    {config.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{entries.length}</span>
                </div>

                <div className="space-y-1.5 min-h-[80px]">
                  {entries.map(entry => {
                    const Icon = TYPE_ICONS[entry.type];
                    const currentIdx = statuses.indexOf(entry.contactStatus || "not_contacted");
                    return (
                      <div key={entry.id} className="rounded-lg border border-border/50 bg-card p-2.5 space-y-1.5 hover:border-primary/20 transition-colors">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{entry.name}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
                          {entry.pro && ` · ${entry.pro}`}
                        </p>
                        {/* Quick move buttons */}
                        <div className="flex gap-1 pt-0.5">
                          {currentIdx > 0 && (
                            <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1 text-muted-foreground"
                              onClick={() => handleMoveStatus(entry.id, statuses[currentIdx - 1])}>
                              ← {CONTACT_STATUS_CONFIG[statuses[currentIdx - 1]].label}
                            </Button>
                          )}
                          {currentIdx < statuses.length - 1 && (
                            <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1 text-primary"
                              onClick={() => handleMoveStatus(entry.id, statuses[currentIdx + 1])}>
                              → {CONTACT_STATUS_CONFIG[statuses[currentIdx + 1]].label}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {entries.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/50 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">No entries</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

PipelineTab.displayName = "PipelineTab";
