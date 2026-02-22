import { useState, useMemo } from "react";
import { Clock, X, Trash2, Star, Search, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";

interface SearchHistoryProps {
  history: SearchHistoryEntry[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
  onTogglePin?: (query: string) => void;
}

function getDateGroup(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && now.getDate() === date.getDate()) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  return "Older";
}

export const SearchHistory = ({ history, onSelect, onRemove, onClear, onTogglePin }: SearchHistoryProps) => {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return history;
    const q = filter.toLowerCase();
    return history.filter(
      (e) => e.title.toLowerCase().includes(q) || e.artist.toLowerCase().includes(q)
    );
  }, [history, filter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = new Map<string, SearchHistoryEntry[]>();
    const order = ["Today", "Yesterday", "This Week", "Older"];
    order.forEach((g) => groups.set(g, []));

    filtered.forEach((e) => {
      if (e.pinned) return;
      const group = getDateGroup(e.timestamp);
      groups.get(group)?.push(e);
    });

    return { pinned: filtered.filter((e) => e.pinned), groups, order };
  }, [filtered]);

  if (history.length === 0) return null;

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const renderEntry = (entry: SearchHistoryEntry) => (
    <button
      key={entry.query}
      onClick={() => onSelect(entry.query)}
      className="group glass glass-hover rounded-lg px-3 py-2 flex items-center gap-2.5 text-sm transition-all hover:border-primary/30"
    >
      {entry.coverUrl && (
        <img
          src={entry.coverUrl}
          alt=""
          className="w-7 h-7 rounded object-cover flex-shrink-0"
        />
      )}
      <div className="text-left min-w-0 flex-1">
        <span className="text-foreground font-medium truncate block max-w-[160px]">
          {entry.title}
        </span>
        <span className="text-muted-foreground text-xs truncate block max-w-[160px]">
          {entry.artist}
        </span>
      </div>
      {/* Signed/Unsigned badge */}
      {entry.totalCount != null && entry.totalCount > 0 && (
        <Badge
          variant="outline"
          className={`text-[10px] shrink-0 ${
            (entry.signedCount ?? 0) > 0
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          }`}
        >
          {(entry.signedCount ?? 0) > 0 ? "Signed" : "Unsigned"} {entry.signedCount ?? 0}/{entry.totalCount}
        </Badge>
      )}
      <span className="text-[10px] text-muted-foreground/60 ml-1 hidden sm:inline shrink-0">
        {formatTime(entry.timestamp)}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Search Again */}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(entry.query);
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity p-0.5"
          title="Search again"
        >
          <RotateCw className="w-3 h-3" />
        </span>
        {onTogglePin && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(entry.query);
            }}
            className={`p-0.5 transition-opacity ${entry.pinned ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"}`}
            title={entry.pinned ? "Unpin" : "Pin"}
          >
            <Star className={`w-3 h-3 ${entry.pinned ? "fill-current" : ""}`} />
          </span>
        )}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(entry.query);
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-1"
        >
          <X className="w-3 h-3" />
        </span>
      </div>
    </button>
  );

  return (
    <div className="w-full max-w-2xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Recent Searches</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Filter title or artist..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 text-xs pl-7 w-40"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Pinned items */}
      {grouped.pinned.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Star className="w-3 h-3" /> Pinned
          </p>
          <div className="flex flex-wrap gap-2">
            {grouped.pinned.map(renderEntry)}
          </div>
        </div>
      )}

      {/* Grouped by date */}
      {grouped.order.map((groupName) => {
        const items = grouped.groups.get(groupName) || [];
        if (items.length === 0) return null;
        return (
          <div key={groupName} className="mb-3">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5">
              {groupName}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map(renderEntry)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
