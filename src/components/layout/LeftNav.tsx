import { memo } from "react";
import { Home, FolderOpen, Eye, Clock, Settings, Disc3, ChevronLeft, ChevronRight, Sun, Moon, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NavSection } from "./AppShell";

interface LeftNavProps {
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS: {id: NavSection;label: string;icon: typeof Home;}[] = [
{ id: "home", label: "Home", icon: Home },
{ id: "projects", label: "Scouting Lists", icon: FolderOpen },
{ id: "watchlist", label: "Watchlist", icon: Eye },
{ id: "history", label: "History", icon: Clock },
{ id: "settings", label: "Settings", icon: Settings }];


export const LeftNav = memo(({
  activeSection,
  onSectionChange,
  collapsed,
  onToggleCollapse
}: LeftNavProps) => {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        className={cn(
          "flex flex-col border-r border-border/50 bg-background shrink-0 transition-all duration-200",
          collapsed ? "w-16" : "w-52"
        )}>
        
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-2.5 px-4 py-4 border-b border-border/50",
          collapsed && "justify-center px-2"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Disc3 className="w-4 h-4 text-primary" />
          </div>
          {!collapsed &&
          <span className="font-display font-semibold text-foreground tracking-tight">Qoda</span>
          }
        </div>

        {/* Nav Items */}
        <div className="flex-1 py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            const button =
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive ?
                "bg-primary/10 text-primary" :
                "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}>
              
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>;


            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>);

            }
            return button;
          })}
        </div>

        {/* Bottom actions */}
        <div className="border-t border-border/50 p-2 space-y-0.5">
          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
                  collapsed && "justify-center"
                )}>
                
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">{theme === "dark" ? "Light Mode" : "Dark Mode"}</TooltipContent>}
          </Tooltip>

          {/* Auth */}
          {user ?
          <Tooltip>
              <TooltipTrigger asChild>
                <button
                onClick={signOut}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
                  collapsed && "justify-center"
                )}>
                
                  <LogOut className="w-4 h-4" />
                  {!collapsed && <span>Sign Out</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Sign Out</TooltipContent>}
            </Tooltip> :

          <Tooltip>
              <TooltipTrigger asChild>
                <Link
                to="/auth"
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
                  collapsed && "justify-center"
                )}>
                
                  <LogIn className="w-4 h-4" />
                  {!collapsed && <span>Sign In</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Sign In</TooltipContent>}
            </Tooltip>
          }

          {/* Collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
              collapsed && "justify-center"
            )}>
            
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </nav>
    </TooltipProvider>);

});

LeftNav.displayName = "LeftNav";