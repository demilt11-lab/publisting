import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, Disc, User2 } from "lucide-react";
import type { EntityMatch } from "@/lib/api/entitySearch";

interface Props {
  match: EntityMatch;
  isBest?: boolean;
  onSelect?: (m: EntityMatch) => void;
  onOpenDetails?: (m: EntityMatch) => void;
}

const TypeIcon = ({ type }: { type: EntityMatch["entity_type"] }) => {
  if (type === "artist") return <User2 className="h-4 w-4" />;
  if (type === "album") return <Disc className="h-4 w-4" />;
  return <Music className="h-4 w-4" />;
};

function confidenceLabel(score: number) {
  if (score >= 0.9) return { label: "Exact", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  if (score >= 0.75) return { label: "Strong", tone: "bg-teal-500/15 text-teal-300 border-teal-500/30" };
  if (score >= 0.55) return { label: "Probable", tone: "bg-blue-500/15 text-blue-300 border-blue-500/30" };
  if (score >= 0.35) return { label: "Ambiguous", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  return { label: "Low", tone: "bg-muted text-muted-foreground border-border" };
}

export function EntityResultCard({ match, isBest, onSelect, onOpenDetails }: Props) {
  const conf = confidenceLabel(match.score);
  const cover = match.cover_url || match.image_url;

  return (
    <Card className={`bg-card border ${isBest ? "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]" : "border-border"}`}>
      <CardContent className="p-3 flex gap-3 items-center">
        <div className="h-14 w-14 rounded-md bg-muted overflow-hidden flex-shrink-0">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <TypeIcon type={match.entity_type} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0 h-5">
              <TypeIcon type={match.entity_type} />
              <span className="ml-1">{match.entity_type}</span>
            </Badge>
            {isBest && <Badge className="text-[10px] px-1.5 py-0 h-5">Best match</Badge>}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${conf.tone}`}>
              {conf.label} · {Math.round(match.score * 100)}%
            </Badge>
          </div>
          <div className="font-medium truncate">{match.title || match.name}</div>
          {match.primary_artist_name && match.primary_artist_name !== (match.title || match.name) && (
            <div className="text-sm text-muted-foreground truncate">{match.primary_artist_name}</div>
          )}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="font-mono">{match.pub_id}</span>
            {match.isrc && <span>ISRC {match.isrc}</span>}
            {match.upc && <span>UPC {match.upc}</span>}
            {typeof match.source_coverage === "number" && match.source_coverage > 0 && (
              <span>{match.source_coverage} sources</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {onSelect && (
            <Button size="sm" variant="default" onClick={() => onSelect(match)}>
              Select
            </Button>
          )}
          {onOpenDetails && (
            <Button size="sm" variant="ghost" onClick={() => onOpenDetails(match)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
