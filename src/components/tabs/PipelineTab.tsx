import { memo, useMemo, useCallback, useState } from "react";
import { User, Pen, Disc3, Building2, Eye, Users, Copy, UserCircle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWatchlist, WatchlistEntry, ContactStatus, CONTACT_STATUS_CONFIG, WatchlistEntityType } from "@/hooks/useWatchlist";
import { Credit } from "@/components/CreditsSection";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTeamContext } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface PipelineTabProps {
  songTitle: string;
  songArtist: string;
  credits: Credit[];
}

const TYPE_ICONS: Record<WatchlistEntityType, typeof User> = {
  writer: Pen, producer: Disc3, artist: User, publisher: Building2, label: Disc3,
};

const COLUMN_COLORS: Record<ContactStatus, string> = {
  not_contacted: "border-muted-foreground/20",
  reached_out: "border-primary/30",
  in_talks: "border-warning/30",
  signed: "border-success/30",
  passed: "border-destructive/30",
};

const COLUMN_HEADER_COLORS: Record<ContactStatus, string> = {
  not_contacted: "bg-muted/50",
  reached_out: "bg-primary/8",
  in_talks: "bg-warning/8",
  signed: "bg-success/8",
  passed: "bg-destructive/8",
};

export const PipelineTab = memo(({ songTitle, songArtist, credits }: PipelineTabProps) => {
  const { watchlist, addToWatchlist, updateContactStatus, assignToUser, isTeamMode, members } = useWatchlist();
  const { toast } = useToast();
  const { user } = useAuth();
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null); // null = anyone, "me" = me, or a user_id

  // Filter watchlist by assignee
  const filteredWatchlist = useMemo(() => {
    if (!assigneeFilter) return watchlist;
    if (assigneeFilter === "me" && user) {
      return watchlist.filter(e => e.assignedToUserId === user.id);
    }
    return watchlist.filter(e => e.assignedToUserId === assigneeFilter);
  }, [watchlist, assigneeFilter, user]);

  const columns = useMemo(() => {
    const cols: Record<ContactStatus, WatchlistEntry[]> = {
      not_contacted: [], reached_out: [], in_talks: [], signed: [], passed: [],
    };
    filteredWatchlist.forEach(entry => {
      const status = entry.contactStatus || "not_contacted";
      cols[status].push(entry);
    });
    return cols;
  }, [filteredWatchlist]);

  const handleAddCredit = useCallback((credit: Credit) => {
    const type: WatchlistEntityType = credit.role === "writer" ? "writer" : credit.role === "producer" ? "producer" : "artist";
    addToWatchlist(
      credit.name,
      type,
      { songTitle, artist: songArtist },
      { pro: credit.pro, ipi: credit.ipi, isMajor: credit.publisher ? ["sony", "universal", "warner", "bmg", "kobalt"].some(m => credit.publisher!.toLowerCase().includes(m)) : undefined },
    );
    toast({ title: "Added to pipeline", description: `${credit.name} added as Not Contacted.` });
  }, [addToWatchlist, songTitle, songArtist, toast]);

  const handleMoveStatus = useCallback((entryId: string, newStatus: ContactStatus) => {
    updateContactStatus(entryId, newStatus);
  }, [updateContactStatus]);

  const handleCopyPerson = useCallback((entry: WatchlistEntry) => {
    const statusLabel = CONTACT_STATUS_CONFIG[entry.contactStatus].label;
    const songs = entry.sources.map(s => `${s.songTitle} — ${s.artist}`).slice(0, 2).join(", ");
    const lines = [
      `👤 ${entry.name} (${entry.type})`,
      entry.pro ? `🎵 PRO: ${entry.pro}` : null,
      entry.isMajor !== undefined ? `📋 ${entry.isMajor ? "Major" : "Indie"}-affiliated` : null,
      `🎶 Songs: ${songs}${entry.sources.length > 2 ? ` +${entry.sources.length - 2} more` : ""}`,
      `📊 Pipeline: ${statusLabel}`,
      entry.assignedToEmail ? `👤 Assigned to: ${entry.assignedToEmail}` : null,
      entry.contactNotes ? `📝 Notes: ${entry.contactNotes}` : null,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      toast({ title: "Copied!", description: `${entry.name}'s summary copied.` });
    }).catch(() => {});
  }, [toast]);

  const handleAssign = useCallback((entryId: string, userId: string | null) => {
    assignToUser(entryId, userId);
    const memberName = userId ? members.find(m => m.user_id === userId)?.invited_email || "team member" : "Unassigned";
    toast({ title: userId ? `Assigned to ${memberName}` : "Unassigned" });
  }, [assignToUser, members, toast]);

  const statuses = Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[];
  const totalEntries = watchlist.length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Assignee filter (team mode only) */}
      {isTeamMode && totalEntries > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Assigned to:</span>
          <div className="flex gap-1">
            <Button
              variant={assigneeFilter === null ? "secondary" : "ghost"}
              size="sm" className="h-6 text-[10px] px-2"
              onClick={() => setAssigneeFilter(null)}
            >Anyone</Button>
            {user && (
              <Button
                variant={assigneeFilter === "me" ? "secondary" : "ghost"}
                size="sm" className="h-6 text-[10px] px-2"
                onClick={() => setAssigneeFilter("me")}
              >Me</Button>
            )}
            {members.filter(m => m.user_id !== user?.id).map(m => (
              <Button
                key={m.user_id}
                variant={assigneeFilter === m.user_id ? "secondary" : "ghost"}
                size="sm" className="h-6 text-[10px] px-2"
                onClick={() => setAssigneeFilter(m.user_id)}
              >{m.invited_email || m.user_id.slice(0, 8)}</Button>
            ))}
          </div>
        </div>
      )}

      {/* Quick add from credits */}
      {credits.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Add from this song's credits</h3>
          <div className="flex flex-wrap gap-1.5">
            {credits.slice(0, 8).map((c, i) => {
              const isInWatchlist = watchlist.some(w => w.name.toLowerCase() === c.name.toLowerCase());
              return (
                <Button
                  key={i}
                  variant={isInWatchlist ? "secondary" : "outline"}
                  size="sm"
                  className="text-[11px] h-7 gap-1 font-medium"
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

      {/* Empty state */}
      {totalEntries === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No one on your watchlist yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Add writers and producers from the Full Credits tab, then track your outreach through pipeline stages.
            </p>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {totalEntries > 0 && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-[900px]">
            {statuses.map(status => {
              const config = CONTACT_STATUS_CONFIG[status];
              const entries = columns[status];
              return (
                <div key={status} className={cn("flex-1 min-w-[160px] rounded-xl border bg-card/50 p-3 space-y-2", COLUMN_COLORS[status])}>
                  <div className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5", COLUMN_HEADER_COLORS[status])}>
                    <Badge variant="outline" className={cn("text-[10px] font-semibold border-0 bg-transparent px-0", config.color)}>
                      {config.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{entries.length}</span>
                  </div>

                  <div className="space-y-1.5 min-h-[80px]">
                    {entries.map(entry => {
                      const Icon = TYPE_ICONS[entry.type];
                      const currentIdx = statuses.indexOf(entry.contactStatus || "not_contacted");
                      return (
                        <div key={entry.id} className="rounded-lg border border-border/50 bg-card p-3 space-y-2 hover:border-primary/20 transition-colors">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-foreground truncate flex-1">{entry.name}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="w-5 h-5 text-muted-foreground hover:text-foreground shrink-0" onClick={() => handleCopyPerson(entry)}>
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Copy person summary</TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
                            {entry.pro && ` · ${entry.pro}`}
                          </p>

                          {/* Assignee chip (team mode) */}
                          {isTeamMode && (
                            <div className="flex items-center gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 gap-1 text-muted-foreground hover:text-foreground">
                                    <UserCircle className="w-3 h-3" />
                                    {entry.assignedToEmail || "Unassigned"}
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-[140px]">
                                  {user && (
                                    <DropdownMenuItem className="text-xs" onClick={() => handleAssign(entry.id, user.id)}>
                                      Assign to me
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  {members.map(m => (
                                    <DropdownMenuItem
                                      key={m.user_id}
                                      className={cn("text-xs", entry.assignedToUserId === m.user_id && "bg-primary/10")}
                                      onClick={() => handleAssign(entry.id, m.user_id)}
                                    >
                                      {m.invited_email || m.user_id.slice(0, 8)}
                                      {m.user_id === user?.id && " (you)"}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-xs text-muted-foreground" onClick={() => handleAssign(entry.id, null)}>
                                    Unassign
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}

                          <div className="flex gap-1 pt-0.5">
                            {currentIdx > 0 && (
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-muted-foreground hover:text-foreground"
                                onClick={() => handleMoveStatus(entry.id, statuses[currentIdx - 1])}>
                                ← {CONTACT_STATUS_CONFIG[statuses[currentIdx - 1]].label}
                              </Button>
                            )}
                            {currentIdx < statuses.length - 1 && (
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-primary"
                                onClick={() => handleMoveStatus(entry.id, statuses[currentIdx + 1])}>
                                → {CONTACT_STATUS_CONFIG[statuses[currentIdx + 1]].label}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {entries.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border/30 p-4 text-center">
                        <p className="text-[10px] text-muted-foreground">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

PipelineTab.displayName = "PipelineTab";
