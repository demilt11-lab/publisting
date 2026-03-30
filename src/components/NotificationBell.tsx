import { useState, useEffect, useMemo } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TIMESTAMPS_KEY = "publisting-last-checked";
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FavSong {
  name: string;
  role: string;
}

interface NotificationBellProps {
  favorites: FavSong[];
  onRecheck: (name: string) => void;
}

function loadTimestamps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TIMESTAMPS_KEY) || "{}"); } catch { return {}; }
}
function saveTimestamp(name: string) {
  const ts = loadTimestamps();
  ts[name] = Date.now();
  localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(ts));
}

export const NotificationBell = ({ favorites, onRecheck }: NotificationBellProps) => {
  const [timestamps, setTimestamps] = useState(loadTimestamps);

  const staleFavs = useMemo(() => {
    if (!favorites || favorites.length === 0) return [];
    const now = Date.now();
    // Only count favorites that are genuinely stale (>24h since last check)
    return favorites.filter(f => {
      const last = timestamps[f.name];
      return !last || (now - last) > STALE_MS;
    });
  }, [favorites, timestamps]);

  const handleRecheck = (name: string) => {
    saveTimestamp(name);
    setTimestamps(loadTimestamps());
    onRecheck(name);
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9 relative">
              <Bell className="w-4 h-4" />
              {staleFavs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center px-0.5">
                  {staleFavs.length > 9 ? "9+" : staleFavs.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-xs font-semibold text-foreground mb-2">
          {staleFavs.length > 0 ? `${staleFavs.length} song${staleFavs.length > 1 ? "s" : ""} need a refresh` : "All favorites up to date"}
        </p>
        {staleFavs.length === 0 && (
          <p className="text-xs text-muted-foreground">Check back later.</p>
        )}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {staleFavs.map(f => (
            <div key={f.name} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-foreground truncate">{f.name}</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0" onClick={() => handleRecheck(f.name)}>
                <RefreshCw className="w-3 h-3 mr-1" /> Re-check
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
