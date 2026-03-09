import { memo, useMemo } from "react";
import { Building2, Disc, Calendar, Hash, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { calculateLabelConfidence } from "@/lib/confidence";
import { Badge } from "@/components/ui/badge";

interface RecordLabelPanelProps {
  recordLabel?: string;
  releaseDate?: string;
  isrc?: string;
  artist: string;
}

const MAJOR_LABEL_GROUPS: Record<string, string> = {
  "Republic": "Universal Music Group",
  "Interscope": "Universal Music Group",
  "Def Jam": "Universal Music Group",
  "Capitol": "Universal Music Group",
  "Island": "Universal Music Group",
  "Geffen": "Universal Music Group",
  "Motown": "Universal Music Group",
  "Polydor": "Universal Music Group",
  "Verve": "Universal Music Group",
  "Mercury": "Universal Music Group",
  "Decca": "Universal Music Group",
  "Virgin": "Universal Music Group",
  "EMI": "Universal Music Group",
  "Columbia": "Sony Music Entertainment",
  "RCA": "Sony Music Entertainment",
  "Epic": "Sony Music Entertainment",
  "Arista": "Sony Music Entertainment",
  "Sony Music": "Sony Music Entertainment",
  "Atlantic": "Warner Music Group",
  "Warner": "Warner Music Group",
  "Elektra": "Warner Music Group",
  "Parlophone": "Warner Music Group",
  "Rhino": "Warner Music Group",
  "Sire": "Warner Music Group",
  "300 Entertainment": "Warner Music Group",
};

function getParentGroup(label: string): string | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  for (const [sub, parent] of Object.entries(MAJOR_LABEL_GROUPS)) {
    if (lower.includes(sub.toLowerCase())) return parent;
  }
  return null;
}

export const RecordLabelPanel = memo(({ recordLabel, releaseDate, isrc, artist }: RecordLabelPanelProps) => {
  const parentGroup = useMemo(() => recordLabel ? getParentGroup(recordLabel) : null, [recordLabel]);
  const isIndependent = !parentGroup;

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="border-l-4 border-primary pl-4">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Disc className="w-5 h-5 text-primary" />
          Record Label Credits
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Label ownership, distribution, and release info
        </p>
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Label */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Record Label</p>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">{recordLabel || "Independent / Unknown"}</p>
            </div>
          </div>

          {/* Parent Group */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Parent Group</p>
            <div className="flex items-center gap-2">
              {parentGroup ? (
                <>
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                    {parentGroup}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">Major</Badge>
                </>
              ) : (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {recordLabel ? "Independent" : "Unknown"}
                </Badge>
              )}
            </div>
          </div>

          {/* Release Date */}
          {releaseDate && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Release Date</p>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-foreground">{releaseDate}</p>
              </div>
            </div>
          )}

          {/* ISRC */}
          {isrc && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">ISRC Code</p>
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-mono text-foreground">{isrc}</p>
              </div>
            </div>
          )}
        </div>

        {/* Distribution (inferred) */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Distribution</p>
          <p className="text-sm text-muted-foreground">
            {parentGroup
              ? `Distributed via ${parentGroup} distribution network`
              : recordLabel
                ? "Distribution info not publicly available"
                : "Self-distributed or undetermined"}
          </p>
        </div>
      </div>
    </div>
  );
});

RecordLabelPanel.displayName = "RecordLabelPanel";
