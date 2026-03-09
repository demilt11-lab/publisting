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
    <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4 sm:gap-5 py-4">
      {steps.map((step, idx) => (
        <div 
          key={idx} 
          className="flex-1 max-w-[180px] flex flex-col items-center text-center p-4 rounded-md border border-border bg-card"
        >
          <span className="section-label text-primary mb-2">{step.step}</span>
          <p className="text-sm font-medium text-foreground mb-0.5">{step.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
        </div>
      ))}
    </div>
  );
});

QuickGuide.displayName = "QuickGuide";