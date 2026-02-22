import { useState } from "react";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface SearchFilters {
  genre: string;
  yearMin: string;
  yearMax: string;
  chart: string;
  syncScore: string;
}

const EMPTY_FILTERS: SearchFilters = { genre: "any", yearMin: "", yearMax: "", chart: "any", syncScore: "any" };

const GENRES = ["Any", "Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Country", "Latin", "K-Pop", "Bollywood/Indian"];
const CHARTS = ["Any", "Billboard Hot 100", "Spotify Global Top 50", "Apple Music Top 100"];
const SYNC_SCORES = ["Any", "Excellent (80-100)", "Good (60-79)", "Fair (40-59)", "Complex (0-39)"];

interface AdvancedFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

export const AdvancedFilters = ({ filters, onChange }: AdvancedFiltersProps) => {
  const [open, setOpen] = useState(false);
  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== "any" && v !== "").length;

  const reset = () => onChange(EMPTY_FILTERS);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-center gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5">
            <Filter className="w-3 h-3" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">{activeCount}</Badge>
            )}
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </CollapsibleTrigger>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6" onClick={reset}>
            <X className="w-3 h-3 mr-0.5" /> Clear
          </Button>
        )}
      </div>
      <CollapsibleContent className="mt-2">
        <div className="flex items-center gap-2 flex-wrap justify-center p-3 rounded-xl border border-border/50 bg-card/50">
          <Select value={filters.genre} onValueChange={(v) => onChange({ ...filters, genre: v })}>
            <SelectTrigger className="h-7 w-auto text-xs">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              {GENRES.map(g => <SelectItem key={g} value={g.toLowerCase().replace(/[/ ]/g, "-")}>{g}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Select value={filters.yearMin || "any"} onValueChange={(v) => onChange({ ...filters, yearMin: v === "any" ? "" : v })}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue placeholder="From" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">From</SelectItem>
                {Array.from({ length: 26 }, (_, i) => String(2000 + i)).map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">–</span>
            <Select value={filters.yearMax || "any"} onValueChange={(v) => onChange({ ...filters, yearMax: v === "any" ? "" : v })}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue placeholder="To" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">To</SelectItem>
                {Array.from({ length: 26 }, (_, i) => String(2025 - i)).map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={filters.chart} onValueChange={(v) => onChange({ ...filters, chart: v })}>
            <SelectTrigger className="h-7 w-auto text-xs"><SelectValue placeholder="Chart" /></SelectTrigger>
            <SelectContent>
              {CHARTS.map(c => <SelectItem key={c} value={c.toLowerCase().replace(/ /g, "-")}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.syncScore} onValueChange={(v) => onChange({ ...filters, syncScore: v })}>
            <SelectTrigger className="h-7 w-auto text-xs"><SelectValue placeholder="Sync Score" /></SelectTrigger>
            <SelectContent>
              {SYNC_SCORES.map(s => <SelectItem key={s} value={s.split(" ")[0].toLowerCase()}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export { EMPTY_FILTERS };
