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
    desc: "Save to projects and watchlists",
  },
];

export const QuickGuide = memo(() => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4 sm:gap-6 py-8">
      {steps.map((step, idx) => (
        <div 
          key={idx} 
          className="flex-1 max-w-[200px] flex flex-col items-center text-center p-5 rounded-lg border border-border/30 bg-card/50"
        >
          <span className="section-label text-primary mb-3">{step.step}</span>
          <p className="text-sm font-medium text-foreground mb-1">{step.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
        </div>
      ))}
    </div>
  );
});

QuickGuide.displayName = "QuickGuide";