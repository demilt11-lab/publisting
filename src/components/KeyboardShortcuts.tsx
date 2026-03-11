import { useState, useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const shortcuts = [
  { keys: ["/"], description: "Focus search bar" },
  { keys: ["⌘", "K"], description: "Command palette" },
  { keys: ["1–5"], description: "Switch Song Detail tabs" },
  { keys: ["W"], description: "Toggle watchlist drawer" },
  { keys: ["H"], description: "Toggle history panel" },
  { keys: ["F"], description: "Toggle favorites" },
  { keys: ["D"], description: "Toggle dark/light mode" },
  { keys: ["Escape"], description: "Close panel / clear search" },
  { keys: ["?"], description: "Toggle this panel" },
];

export const KeyboardShortcuts = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 w-9 h-9 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border/50"
        title="Keyboard shortcuts"
      >
        <Keyboard className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-72 glass rounded-xl p-4 shadow-xl animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Keyboard className="w-4 h-4" />
          Keyboard Shortcuts
        </h4>
        <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setOpen(false)}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.description} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{s.description}</span>
            <div className="flex gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground font-mono text-[10px]"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
