import { ReactNode, useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeftNav } from "./LeftNav";
import { cn } from "@/lib/utils";
import { Eye, X, Users, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchlistView } from "@/components/WatchlistView";
import { useTeamContext } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export type NavSection = "home" | "history" | "settings" | "howto";

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
  const { user } = useAuth();
  const { activeTeam, setActiveTeam, teams } = useTeamContext();

  // Listen for keyboard shortcut 'w' to toggle drawer
  useEffect(() => {
    const handler = () => setWatchlistDrawerOpen(v => !v);
    window.addEventListener("toggle-watchlist-drawer", handler);
    return () => window.removeEventListener("toggle-watchlist-drawer", handler);
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen bg-background flex overflow-hidden">
      {/* Left Nav */}
      <LeftNav
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed(!navCollapsed)}
      />

      {/* Center Canvas */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Team Switcher Bar */}
        {user && teams.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-b border-border/50 bg-card/50 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 font-medium">
                  {activeTeam?.name || "Select Team"}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {teams.map(team => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => setActiveTeam(team)}
                    className={cn("text-xs", activeTeam?.id === team.id && "bg-primary/10 text-primary")}
                  >
                    {team.name}
                    {activeTeam?.id === team.id && (
                      <Badge variant="secondary" className="ml-2 text-[9px]">Active</Badge>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSectionChange("settings")} className="text-xs text-muted-foreground">
                  <Plus className="w-3 h-3 mr-1" /> Manage Teams
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {activeTeam && (
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                Shared watchlist
              </Badge>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      {/* Watchlist Drawer Toggle */}
      {!watchlistDrawerOpen && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-5 bottom-5 z-50 w-11 h-11 rounded-full bg-card border-border/60 shadow-xl shadow-black/30 hover:bg-primary/10 hover:border-primary/40 hover:shadow-primary/10 transition-all group"
          onClick={() => setWatchlistDrawerOpen(true)}
        >
          <Eye className="w-4.5 h-4.5 text-primary group-hover:scale-110 transition-transform" />
        </Button>
      )}

      {/* Watchlist Drawer */}
      {watchlistDrawerOpen && (
        <aside className="w-[340px] min-w-[300px] shrink-0 overflow-auto bg-card border-l border-border/50 animate-slide-in-right flex flex-col">
          <div className="sticky top-0 z-10 bg-card border-b border-border/50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">Watchlist</span>
                {activeTeam && (
                  <p className="text-[10px] text-muted-foreground">{activeTeam.name}</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => setWatchlistDrawerOpen(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <WatchlistView
              onClose={() => setWatchlistDrawerOpen(false)}
              onSearchSong={onSearchSong}
            />
          </div>
        </aside>
      )}
    </div>
  );
};
