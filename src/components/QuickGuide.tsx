import { memo } from "react";
import { Search, Users, FolderOpen } from "lucide-react";

const steps = [
  {
    icon: Search,
    step: "01",
    title: "Search",
    desc: "Paste a link or type a song name",
  },
  {
    icon: Users,
    step: "02",
    title: "Analyze",
    desc: "See writers, publishers, and labels",
  },
  {
    icon: FolderOpen,
    step: "03",
    title: "Organize",
    desc: "Save to scouting lists and watchlists",
  },
];

export const QuickGuide = memo(() => {
  return (
    <div className="flex items-stretch justify-center gap-3">
      {steps.map((step, idx) => (
        <div 
          key={idx} 
          className="flex-1 max-w-[140px] flex flex-col items-center text-center p-3 rounded-lg border border-border/50 bg-surface"
        >
          <span className="text-[10px] font-medium text-primary mb-1.5 tracking-wider">{step.step}</span>
          <p className="text-xs font-semibold text-foreground mb-0.5">{step.title}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{step.desc}</p>
        </div>
      ))}
    </div>
  );
});

QuickGuide.displayName = "QuickGuide";
