import { ReactNode, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeftNav } from "./LeftNav";
import { cn } from "@/lib/utils";

export type NavSection = "home" | "projects" | "watchlist" | "history" | "settings";

interface AppShellProps {
  children: ReactNode;
  rightPanel?: ReactNode;
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  showRightPanel?: boolean;
  onCloseRightPanel?: () => void;
}

export const AppShell = ({
  children,
  rightPanel,
  activeSection,
  onSectionChange,
  showRightPanel = false,
  onCloseRightPanel,
}: AppShellProps) => {
  const isMobile = useIsMobile();
  const [navCollapsed, setNavCollapsed] = useState(false);

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

  // Desktop: 3-panel layout
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
          showRightPanel ? "max-w-[45%]" : "max-w-[85%]"
        )}
      >
        {children}
      </main>

      {/* Right Panel - Song Profile */}
      {showRightPanel && rightPanel && (
        <aside className="w-[45%] min-w-[400px] max-w-[600px] overflow-auto bg-surface">
          {rightPanel}
        </aside>
      )}
    </div>
  );
};
