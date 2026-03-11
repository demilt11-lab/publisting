import { ReactNode, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeftNav } from "./LeftNav";
import { cn } from "@/lib/utils";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchlistView } from "@/components/WatchlistView";

export type NavSection = "home" | "history" | "settings";

interface AppShellProps {
  children: ReactNode;
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  onSearchSong?: (query: string) => void;
}

export const AppShell = ({
  children,
  activeSection,
  onSectionChange,
  onSearchSong,
}: AppShellProps) => {
  const isMobile = useIsMobile();
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [watchlistDrawerOpen, setWatchlistDrawerOpen] = useState(false);

  // Mobile: simple stack
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {children}
      </div>
    );
  }

  // Desktop: left nav + center canvas + optional right watchlist drawer
  return (
    <div className="min-h-screen bg-background flex">
      {/* Slim Left Nav */}
      <LeftNav
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed(!navCollapsed)}
      />

      {/* Center Canvas — the main stage */}
      <main className={cn(
        "flex-1 overflow-auto transition-all duration-200",
        watchlistDrawerOpen ? "mr-0" : ""
      )}>
        {children}
      </main>

      {/* Watchlist Drawer Toggle (floating button) */}
      {!watchlistDrawerOpen && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 bottom-4 z-50 w-10 h-10 rounded-full bg-card border-border shadow-lg hover:bg-primary/10 hover:border-primary/30 transition-all"
          onClick={() => setWatchlistDrawerOpen(true)}
        >
          <Eye className="w-4 h-4 text-primary" />
        </Button>
      )}

      {/* Watchlist Slide-in Drawer */}
      {watchlistDrawerOpen && (
        <aside className="w-[320px] min-w-[280px] shrink-0 overflow-auto bg-card border-l border-border/50 animate-slide-in-right">
          <div className="sticky top-0 z-10 bg-card border-b border-border/50 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Watchlist</span>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setWatchlistDrawerOpen(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <WatchlistView
            onClose={() => setWatchlistDrawerOpen(false)}
            onSearchSong={onSearchSong}
          />
        </aside>
      )}
    </div>
  );
};
