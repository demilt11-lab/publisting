import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight, Search, Filter, Shield, Briefcase, GitCompareArrows, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "publisting-onboarding-done";

const STEPS = [
  {
    title: "Search for any song",
    description: "Paste a Spotify/Apple Music link or type a song name + artist. Try searching \"Espresso by Sabrina Carpenter\" to see it in action!",
    icon: Search,
    target: "search-bar",
    sampleQuery: "Espresso Sabrina Carpenter",
  },
  {
    title: "Analyze credits & publishers",
    description: "See every writer, producer, and their publishers. Look for \"Unsigned\" badges — those are potential signing targets.",
    icon: Filter,
    target: "credits",
  },
  {
    title: "Check the Sync Score",
    description: "Each song gets a score (0-100) showing how easy it is to clear for sync licensing. Higher = fewer rights holders.",
    icon: Shield,
    target: "sync-score",
  },
  {
    title: "Save to your watchlist",
    description: "Found an unsigned writer? Add them to your watchlist pipeline and track your outreach progress.",
    icon: Briefcase,
    target: "watchlist",
  },
  {
    title: "Compare & analyze",
    description: "Compare up to 3 songs side by side, or use Catalog Analysis to estimate a writer's full catalog value.",
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
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto px-4 w-full max-w-sm">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
                <h3 className="font-semibold text-foreground text-sm">{current.title}</h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0" onClick={handleSkip} aria-label="Skip tour">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

          {/* Sample search hint on step 1 */}
          {step === 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs text-foreground/80">
                Pro tip: Paste a Spotify link for instant, accurate results
              </span>
            </div>
          )}

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground min-h-[36px]" onClick={handleSkip}>
              Skip Tour
            </Button>
            <Button size="sm" className="text-xs gap-1 min-h-[36px]" onClick={handleNext}>
              {step >= STEPS.length - 1 ? "Get Started" : "Next"}
              {step < STEPS.length - 1 && <ArrowRight className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
