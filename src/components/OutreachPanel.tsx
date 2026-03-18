import { memo, useMemo } from "react";
import { Users, Instagram, Mic2, PenTool, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { GapsMessage } from "@/components/ui/gaps-message";
import { calculateOutreachConfidence, detectOutreachGaps } from "@/lib/confidence";

interface ContactTarget {
  name: string;
  role: "artist" | "writer" | "producer";
  publisher?: string;
  pro?: string;
}

interface OutreachPanelProps {
  artist: string;
  songTitle: string;
  credits: {
    name: string;
    role: string;
    publisher?: string;
    pro?: string;
  }[];
  recordLabel?: string;
}

function buildInstagramSearchUrl(name: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`;
}

function getRoleIcon(role: string) {
  switch (role) {
    case "artist": return <Mic2 className="w-3.5 h-3.5" />;
    case "writer": return <PenTool className="w-3.5 h-3.5" />;
    case "producer": return <Users className="w-3.5 h-3.5" />;
    default: return <Users className="w-3.5 h-3.5" />;
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "artist": return "bg-primary/20 text-primary";
    case "writer": return "bg-blue-500/20 text-blue-400";
    case "producer": return "bg-purple-500/20 text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export const OutreachPanel = memo(({ artist, credits, recordLabel }: OutreachPanelProps) => {
  const targets = useMemo<ContactTarget[]>(() => {
    const result: ContactTarget[] = [];
    const seen = new Set<string>();

    result.push({ name: artist, role: "artist" });
    seen.add(artist.toLowerCase());

    const writers = credits.filter(c => c.role === "writer").slice(0, 5);
    writers.forEach(w => {
      if (!seen.has(w.name.toLowerCase())) {
        result.push({ name: w.name, role: "writer", publisher: w.publisher, pro: w.pro });
        seen.add(w.name.toLowerCase());
      }
    });

    const producers = credits.filter(c => c.role === "producer").slice(0, 3);
    producers.forEach(p => {
      if (!seen.has(p.name.toLowerCase())) {
        result.push({ name: p.name, role: "producer", publisher: p.publisher, pro: p.pro });
        seen.add(p.name.toLowerCase());
      }
    });

    return result;
  }, [artist, credits]);

  const confidence = useMemo(() => calculateOutreachConfidence(credits, {}), [credits]);
  const gaps = useMemo(() => detectOutreachGaps(credits, {}), [credits]);

  if (credits.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="glass rounded-xl p-4 sm:p-5 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Contacts
          </h3>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={confidence} />
            <Badge variant="outline" className="text-[10px]">
              {targets.length} people
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          {targets.map((target, idx) => (
            <div
              key={`${target.name}-${idx}`}
              className="rounded-lg border border-border/50 bg-card/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${getRoleColor(target.role)}`}>
                    {getRoleIcon(target.role)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{target.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize truncate">
                      {target.role}
                      {target.publisher && ` • ${target.publisher}`}
                      {target.pro && ` • ${target.pro}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                    <a href={buildInstagramSearchUrl(target.name)} target="_blank" rel="noopener noreferrer" title="Search on Instagram">
                      <Instagram className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {recordLabel && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{recordLabel}</p>
                <p className="text-[10px] text-muted-foreground">Record Label</p>
              </div>
            </div>
          </div>
        )}

        {/* Gaps and next steps */}
        <GapsMessage gaps={gaps} />
      </div>
    </TooltipProvider>
  );
});

OutreachPanel.displayName = "OutreachPanel";
