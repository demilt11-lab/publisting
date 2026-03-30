import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight, Search, Filter, Shield, Briefcase, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "publisting-onboarding-done";

const STEPS = [
  {
    title: "Search for any song",
    description: "Paste a Spotify/Apple Music link or type a song name + artist to look up publishing rights.",
    icon: Search,
    target: "search-bar",
  },
  {
    title: "Filter your results",
    description: "Use advanced filters to narrow by genre, year, chart position, or sync score.",
    icon: Filter,
    target: "filters",
  },
  {
    title: "Check the Sync Score",
    description: "Each song gets a sync licensing score (0-100) based on streams, charts, and rights complexity.",
    icon: Shield,
    target: "sync-score",
  },
  {
    title: "Track your deals",
    description: "Add songs to your deals pipeline. Track status, contacts, and follow-up dates.",
    icon: Briefcase,
    target: "deals",
  },
  {
    title: "Compare songs",
    description: "Add up to 3 songs to compare their publishing rights side by side.",
    icon: GitCompareArrows,
    target: "compare",
  },
];

export const OnboardingTour = () => {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setStep(0), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (step >= STEPS.length - 1) {
      setStep(-1);
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      setStep(s => s + 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    setStep(-1);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  if (step < 0) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" role="dialog" aria-label="Onboarding tour">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-auto" onClick={handleSkip} />

      {/* Tooltip card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-6 max-w-sm w-[90vw] space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
                <h3 className="font-semibold text-foreground text-sm">{current.title}</h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={handleSkip} aria-label="Skip tour">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{current.description}</p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={handleSkip}>
              Skip Tour
            </Button>
            <Button size="sm" className="text-xs gap-1" onClick={handleNext}>
              {step >= STEPS.length - 1 ? "Get Started" : "Next"}
              {step < STEPS.length - 1 && <ArrowRight className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
