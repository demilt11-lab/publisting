import { useState, useMemo } from "react";
import { Clock, Search, Heart, Briefcase, X, RotateCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";

interface SearchHistoryTabProps {
  history: SearchHistoryEntry[];
  onSearch: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
  onClose: () => void;
}

type SortKey = "date" | "title" | "artist";

export const SearchHistoryTab = ({ history, onSearch, onRemove, onClear, onClose }: SearchHistoryTabProps) => {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const filtered = useMemo(() => {
    let list = history;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(e => e.title.toLowerCase().includes(q) || e.artist.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "artist") return a.artist.localeCompare(b.artist);
      return b.timestamp - a.timestamp;
    });
    return list;
  }, [history, filter, sortBy]);

  const paged = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-display text-lg font-semibold text-foreground">Search History</h3>
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={onClear} aria-label="Clear all history">
              Clear All
            </Button>
          )}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose} aria-label="Close history">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Filter by title or artist..." value={filter} onChange={e => setFilter(e.target.value)} className="h-8 text-xs pl-8" />
        </div>
        <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
          <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest First</SelectItem>
            <SelectItem value="title">Title A-Z</SelectItem>
            <SelectItem value="artist">Artist A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {history.length === 0 ? "No searches yet. Start by searching for a song!" : "No results match your filter."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {paged.map(entry => (
            <div key={entry.query + entry.timestamp} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors">
              {entry.coverUrl && (
                <img src={entry.coverUrl} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
              )}
              {!entry.coverUrl && (
                <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                <p className="text-xs text-muted-foreground truncate">{entry.artist}</p>
              </div>
              {entry.totalCount != null && entry.totalCount > 0 && (
                <Badge variant="outline" className={`text-[10px] shrink-0 ${
                  (entry.signedCount ?? 0) > 0
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                }`}>
                  {(entry.signedCount ?? 0) > 0 ? "Signed" : "Unsigned"}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:inline">{formatTime(entry.timestamp)}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onSearch(entry.artist && entry.title ? `${entry.artist} - ${entry.title}` : entry.query)} aria-label="Search again">
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => onRemove(entry.query)} aria-label="Remove from history">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPage(p => p + 1)}>
                Load More ({filtered.length - paged.length} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
