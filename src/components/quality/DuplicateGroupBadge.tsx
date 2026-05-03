import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fetchEntityDuplicates } from "@/lib/api/dataQuality";

interface Props {
  entityType: "track" | "artist" | "creator";
  entityId: string;
}

/** Shows "N versions found" badge with expandable list of potential duplicates. */
export function DuplicateGroupBadge({ entityType, entityId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: dups = [] } = useQuery({
    queryKey: ["potential-duplicates", entityType, entityId],
    queryFn: () => fetchEntityDuplicates(entityType, entityId),
    staleTime: 60_000,
  });
  if (!dups.length) return null;
  const versions = dups.length + 1;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1">
          <Layers className="h-3 w-3" />
          {versions} versions found
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1">
        {dups.map((d) => {
          const other = d.entity_id_1 === entityId ? d.entity_id_2 : d.entity_id_1;
          return (
            <div key={d.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{other}</span>
              <Badge variant="outline" className="text-[10px]">
                {Math.round(d.similarity_score * 100)}% similar
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">
                {d.merge_status.replace("_", " ")}
              </Badge>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}