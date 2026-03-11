import { memo } from "react";
import { Home, Clock, Settings, ChevronLeft, ChevronRight, Sun, Moon, LogIn, LogOut, SearchCheck, HelpCircle, Users } from "lucide-react";
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

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "history", label: "History", icon: Clock },
  { id: "teams", label: "Teams", icon: Users },
  { id: "howto", label: "How to use", icon: HelpCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

export const LeftNav = memo(({
  activeSection,
  onSectionChange,
  collapsed,
  onToggleCollapse,
}: LeftNavProps) => {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        className={cn(
          "flex flex-col border-r border-border/50 bg-card shrink-0 transition-all duration-200",
          collapsed ? "w-[60px]" : "w-52"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 px-4 h-16 border-b border-border/50",
          collapsed && "justify-center px-2"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <SearchCheck className="w-4.5 h-4.5 text-primary" />
          </div>
          {!collapsed && (
            <span className="font-bold text-foreground tracking-tight text-[13px] leading-tight">
              Music Deal<br />Finder
            </span>
          )}
        </div>

        {/* Nav Items */}
        <div className="flex-1 py-4 space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            const button = (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <Icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-primary")} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
                </Tooltip>
              );
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
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
                  collapsed && "justify-center"
                )}
              >
                {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
                {!collapsed && <span className="text-xs">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right" className="text-xs">{theme === "dark" ? "Light Mode" : "Dark Mode"}</TooltipContent>}
          </Tooltip>

          {/* Auth */}
          {user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
                    collapsed && "justify-center"
                  )}
                >
                  <LogOut className="w-[18px] h-[18px]" />
                  {!collapsed && <span className="text-xs">Sign Out</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right" className="text-xs">Sign Out</TooltipContent>}
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/auth"
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
                    collapsed && "justify-center"
                  )}
                >
                  <LogIn className="w-[18px] h-[18px]" />
                  {!collapsed && <span className="text-xs">Sign In</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right" className="text-xs">Sign In</TooltipContent>}
            </Tooltip>
          )}

          {/* Collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <ChevronRight className="w-[18px] h-[18px]" /> : <ChevronLeft className="w-[18px] h-[18px]" />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </nav>
    </TooltipProvider>
  );
});

LeftNav.displayName = "LeftNav";
