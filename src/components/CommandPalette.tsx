import { useState, useEffect, useCallback } from "react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Clock, Music, Briefcase, Heart, GitCompareArrows, Sun, Moon, Upload, History } from "lucide-react";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: SearchHistoryEntry[];
  onSearch: (query: string) => void;
  onToggleFavorites?: () => void;
  onToggleTheme?: () => void;
  onOpenBatch?: () => void;
  onOpenDeals?: () => void;
  onOpenHistory?: () => void;
}

export const CommandPalette = ({
  open, onOpenChange, history, onSearch,
  onToggleFavorites, onToggleTheme, onOpenBatch, onOpenDeals, onOpenHistory,
}: CommandPaletteProps) => {

  const handleSelect = useCallback((value: string) => {
    onOpenChange(false);
    if (value.startsWith("search:")) {
      onSearch(value.replace("search:", ""));
    } else if (value === "action:favorites") {
      onToggleFavorites?.();
    } else if (value === "action:theme") {
      onToggleTheme?.();
    } else if (value === "action:batch") {
      onOpenBatch?.();
    } else if (value === "action:deals") {
      onOpenDeals?.();
    } else if (value === "action:history") {
      onOpenHistory?.();
    }
  }, [onOpenChange, onSearch, onToggleFavorites, onToggleTheme, onOpenBatch, onOpenDeals, onOpenHistory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        <Command className="rounded-lg border-none">
          <CommandInput placeholder="Search songs, actions..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No results found.</CommandEmpty>
            {history.length > 0 && (
              <CommandGroup heading="Recent Searches">
                {history.slice(0, 5).map((entry) => (
                  <CommandItem
                    key={entry.query}
                    value={`search:${entry.artist && entry.title ? `${entry.artist} - ${entry.title}` : entry.query}`}
                    onSelect={handleSelect}
                    className="flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{entry.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">{entry.artist}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              <CommandItem value="action:favorites" onSelect={handleSelect}>
                <Heart className="w-4 h-4 mr-2" /> Open Favorites
              </CommandItem>
              <CommandItem value="action:history" onSelect={handleSelect}>
                <History className="w-4 h-4 mr-2" /> Open History
              </CommandItem>
              <CommandItem value="action:deals" onSelect={handleSelect}>
                <Briefcase className="w-4 h-4 mr-2" /> Open Deals Tracker
              </CommandItem>
              <CommandItem value="action:batch" onSelect={handleSelect}>
                <Upload className="w-4 h-4 mr-2" /> Batch Upload
              </CommandItem>
              <CommandItem value="action:theme" onSelect={handleSelect}>
                <Sun className="w-4 h-4 mr-2" /> Toggle Theme
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Trending">
              {[
                { title: "APT.", artist: "ROSÉ & Bruno Mars" },
                { title: "Not Like Us", artist: "Kendrick Lamar" },
                { title: "Espresso", artist: "Sabrina Carpenter" },
              ].map((song) => (
                <CommandItem
                  key={song.title}
                  value={`search:${song.title} ${song.artist}`}
                  onSelect={handleSelect}
                >
                  <Music className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">{song.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">{song.artist}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
