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
    desc: "Save to watchlist",
  },
];

export const QuickGuide = memo(() => {
  return (
    <div className="grid grid-cols-3 gap-3">
      {steps.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.step}
            className="rounded-xl border border-border/50 bg-card p-4 space-y-2 text-center"
          >
            <div className="w-9 h-9 mx-auto rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs font-semibold text-foreground">{s.title}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
});

QuickGuide.displayName = "QuickGuide";
