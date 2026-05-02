import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";
import { useEntitySearch } from "@/hooks/useEntitySearch";
import { EntityResultCard } from "./EntityResultCard";
import type { EntityMatch } from "@/lib/api/entitySearch";

interface Props {
  defaultQuery?: string;
  onPick?: (m: EntityMatch) => void;
}

export function EntitySearchPanel({ defaultQuery = "", onPick }: Props) {
  const [q, setQ] = useState(defaultQuery);
  const { result, isLoading, search } = useEntitySearch();

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    search(q.trim());
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paste a Spotify/Apple/Deezer URL, ISRC, UPC, or song/artist name…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={isLoading || !q.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="capitalize">{result.parsed_kind}</Badge>
            <span>
              {result.best_match
                ? `${result.alternates.length + 1} match${result.alternates.length === 0 ? "" : "es"}`
                : "No matches in canonical index — try a wider search or paste a URL/ISRC."}
            </span>
          </div>
          {result.best_match && (
            <EntityResultCard match={result.best_match} isBest onSelect={onPick} />
          )}
          {result.alternates.length > 0 && (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">
                Alternate matches
              </div>
              {result.alternates.map((m) => (
                <EntityResultCard key={`${m.entity_type}-${m.id}`} match={m} onSelect={onPick} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
