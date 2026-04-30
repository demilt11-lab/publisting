import { memo, useEffect, useMemo, useRef } from "react";
import { Network, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { recordTrackCollaborators } from "@/lib/api/collaboratorGraph";

interface Props {
  writers: string[];
  producers: string[];
  publishers: string[];
}

/**
 * Per-track collaborator panel.
 * Shows the writer / producer / publisher network for the current track and
 * persists the resulting edges to collaborator_edges (idempotent).
 */
export const CollaboratorTrackPanel = memo(({ writers, producers, publishers }: Props) => {
  const lastSig = useRef<string>("");
  useEffect(() => {
    const sig = JSON.stringify({ writers, producers, publishers });
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (writers.length || producers.length) {
      void recordTrackCollaborators({ writers, producers, publishers });
    }
  }, [writers, producers, publishers]);

  const allPeople = useMemo(() => {
    return Array.from(new Set([...writers, ...producers]));
  }, [writers, producers]);

  if (!allPeople.length && !publishers.length) return null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          Collaborator Network
          <span className="text-[10px] text-muted-foreground font-normal">(per-track)</span>
        </h4>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Users className="w-3 h-3" />
          {allPeople.length} people · {publishers.length} publishers
        </Badge>
      </div>

      {writers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Co-writers</p>
          <div className="flex flex-wrap gap-1.5">
            {writers.map((w) => (
              <Link key={`w-${w}`} to={`/network/${encodeURIComponent(w)}`}
                className="text-[11px] px-2 py-0.5 rounded border border-border/40 bg-background/40 hover:border-primary/50 hover:text-primary transition-colors">
                {w}
              </Link>
            ))}
          </div>
        </div>
      )}

      {producers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Co-producers</p>
          <div className="flex flex-wrap gap-1.5">
            {producers.map((p) => (
              <Link key={`p-${p}`} to={`/network/${encodeURIComponent(p)}`}
                className="text-[11px] px-2 py-0.5 rounded border border-border/40 bg-background/40 hover:border-primary/50 hover:text-primary transition-colors">
                {p}
              </Link>
            ))}
          </div>
        </div>
      )}

      {publishers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Linked publishers</p>
          <div className="flex flex-wrap gap-1.5">
            {publishers.map((pub) => (
              <Badge key={pub} variant="outline" className="text-[10px] bg-violet-500/10 text-violet-300 border-violet-500/30">
                {pub}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
CollaboratorTrackPanel.displayName = "CollaboratorTrackPanel";