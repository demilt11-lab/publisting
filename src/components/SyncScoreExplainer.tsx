import { Shield, TrendingUp, BarChart3, Building2, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface SyncScoreExplainerProps {
  score: number;
  streamPts: number;
  chartPts: number;
  signedPts: number;
  publisherPts: number;
  children: React.ReactNode;
}

export const SyncScoreExplainer = ({ score, streamPts, chartPts, signedPts, publisherPts, children }: SyncScoreExplainerProps) => {
  const breakdown = [
    { label: "Stream Count", pts: streamPts, max: 40, icon: TrendingUp, color: "bg-emerald-500" },
    { label: "Chart Placements", pts: chartPts, max: 25, icon: BarChart3, color: "bg-blue-500" },
    { label: "Rights Cleared", pts: signedPts, max: 20, icon: Building2, color: "bg-violet-500" },
    { label: "Publisher Simplicity", pts: publisherPts, max: 15, icon: Users, color: "bg-amber-500" },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-primary" />
              Sync Score Breakdown
            </h4>
            <Badge variant="outline" className="text-xs font-bold">{score}/100</Badge>
          </div>
          <div className="space-y-2.5">
            {breakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <item.icon className="w-3 h-3" />
                    {item.label}
                  </span>
                  <span className="text-foreground font-medium">{item.pts}/{item.max}</span>
                </div>
                <Progress value={(item.pts / item.max) * 100} className="h-1.5" />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Higher scores indicate songs that are easier to clear for sync licensing.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
