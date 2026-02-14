import { Clock, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";

interface SearchHistoryProps {
  history: SearchHistoryEntry[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

export const SearchHistory = ({ history, onSelect, onRemove, onClear }: SearchHistoryProps) => {
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

  return (
    <div className="w-full max-w-2xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Recent Searches</span>
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
      <div className="flex flex-wrap gap-2">
        {history.map((entry) => (
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
            <div className="text-left min-w-0">
              <span className="text-foreground font-medium truncate block max-w-[160px]">
                {entry.title}
              </span>
              <span className="text-muted-foreground text-xs truncate block max-w-[160px]">
                {entry.artist}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 ml-1 hidden sm:inline">
              {formatTime(entry.timestamp)}
            </span>
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
          </button>
        ))}
      </div>
    </div>
  );
};
