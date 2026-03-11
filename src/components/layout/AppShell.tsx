import { ReactNode, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeftNav } from "./LeftNav";
import { cn } from "@/lib/utils";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchlistView } from "@/components/WatchlistView";

export type NavSection = "home" | "projects" | "watchlist" | "history" | "settings";

interface AppShellProps {
  children: ReactNode;
  rightPanel?: ReactNode;
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  showRightPanel?: boolean;
  onCloseRightPanel?: () => void;
  onSearchSong?: (query: string) => void;
}

export const AppShell = ({
  children,
  rightPanel,
  activeSection,
  onSectionChange,
  showRightPanel = false,
  onCloseRightPanel,
  onSearchSong,
}: AppShellProps) => {
  const isMobile = useIsMobile();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [watchlistDrawerOpen, setWatchlistDrawerOpen] = useState(false);

  // Mobile: stack views
  if (isMobile) {
    if (showRightPanel && rightPanel) {
      return (
        <div className="min-h-screen bg-background flex flex-col">
          {rightPanel}
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {children}
      </div>
    );
  }

  // Desktop: 3-panel layout with optional watchlist drawer
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Nav Panel */}
      <LeftNav
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed(!navCollapsed)}
      />

      {/* Center Panel - Search & Results */}
      <main
        className={cn(
          "flex-1 border-r border-border/50 overflow-auto transition-all",
          showRightPanel ? "max-w-[45%]" : "max-w-full"
        )}
      >
        {children}
      </main>

      {/* Right Panel - Song Profile */}
      {showRightPanel && rightPanel && (
        <aside className={cn(
          "overflow-auto bg-card border-r border-border/50 transition-all",
          watchlistDrawerOpen ? "w-[40%] min-w-[380px]" : "w-[45%] min-w-[400px] max-w-[600px]"
        )}>
          {rightPanel}
        </aside>
      )}

      {/* Watchlist Drawer Toggle (floating button) */}
      {!watchlistDrawerOpen && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 bottom-4 z-50 w-10 h-10 rounded-full bg-card border-border shadow-lg hover:bg-primary/10 hover:border-primary/30"
          onClick={() => setWatchlistDrawerOpen(true)}
        >
          <Eye className="w-4 h-4 text-primary" />
        </Button>
      )}

      {/* Watchlist Slide-in Drawer */}
      {watchlistDrawerOpen && (
        <aside className="w-[320px] min-w-[280px] overflow-auto bg-card border-l border-border/50 animate-slide-in-right">
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
