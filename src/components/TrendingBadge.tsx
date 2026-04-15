import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, Flame, Globe, ListMusic, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendingBadgeProps {
  velocityType: string;
  weeklyChangePct?: number;
  className?: string;
}

const VELOCITY_CONFIG: Record<string, { icon: any; label: string; color: string; bgColor: string; tooltip: string }> = {
  viral: {
    icon: Flame,
    label: "🔥 Viral",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20",
    tooltip: "This song is experiencing viral growth (>200% week-over-week)",
  },
  trending: {
    icon: TrendingUp,
    label: "📈 Trending",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20",
    tooltip: "Strong upward momentum (>100% week-over-week growth)",
  },
  regional_breakout: {
    icon: Globe,
    label: "🌍 Regional Breakout",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20",
    tooltip: "Song is trending in a specific region but not globally",
  },
  playlist_boost: {
    icon: ListMusic,
    label: "🎧 Playlist Boost",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20",
    tooltip: "Spike correlated with major playlist addition",
  },
  seasonal: {
    icon: CalendarDays,
    label: "📅 Seasonal",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20",
    tooltip: "Recurring annual performance spike (e.g., holiday song)",
  },
};

export function TrendingBadge({ velocityType, weeklyChangePct, className }: TrendingBadgeProps) {
  const config = VELOCITY_CONFIG[velocityType];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 gap-1 cursor-help",
              config.bgColor,
              config.color,
              className
            )}
          >
            <Icon className="w-2.5 h-2.5" />
            {config.label}
            {weeklyChangePct && weeklyChangePct > 0 && (
              <span className="font-mono">+{weeklyChangePct.toFixed(0)}%</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
