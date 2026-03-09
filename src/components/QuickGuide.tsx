import { memo } from "react";
import { Search, Users, FolderOpen } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Search a song or artist",
    desc: "Paste a link or type a song name",
  },
  {
    icon: Users,
    title: "See who controls it",
    desc: "Writers, publishers, and labels",
  },
  {
    icon: FolderOpen,
    title: "Save to projects",
    desc: "Organize leads and watchlists",
  },
];

export const QuickGuide = memo(() => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 py-4">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <step.icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.desc}</p>
          </div>
          {idx < steps.length - 1 && (
            <div className="hidden sm:block w-8 h-px bg-border ml-2" />
          )}
        </div>
      ))}
    </div>
  );
});

QuickGuide.displayName = "QuickGuide";
