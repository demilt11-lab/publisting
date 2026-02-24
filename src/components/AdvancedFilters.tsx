import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

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
const SYNC_SCORES = [
  { label: "Any Score", value: "any" },
  { label: "Excellent (80-100)", value: "excellent" },
  { label: "Good (60-79)", value: "good" },
  { label: "Fair (40-59)", value: "fair" },
  { label: "Complex (0-39)", value: "complex" },
];

interface AdvancedFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

function chipLabel(key: string, filters: SearchFilters): string {
  switch (key) {
    case "genre":
      return filters.genre === "any" ? "Any Genre" : GENRES.find(g => g.toLowerCase().replace(/[/ ]/g, "-") === filters.genre) || "Any Genre";
    case "year":
      if (filters.yearMin && filters.yearMax) return `${filters.yearMin}–${filters.yearMax}`;
      if (filters.yearMin) return `From ${filters.yearMin}`;
      if (filters.yearMax) return `To ${filters.yearMax}`;
      return "Any Year";
    case "chart":
      return filters.chart === "any" ? "Any Chart" : CHARTS.find(c => c.toLowerCase().replace(/ /g, "-") === filters.chart) || "Any Chart";
    case "syncScore":
      return filters.syncScore === "any" ? "Any Score" : SYNC_SCORES.find(s => s.value === filters.syncScore)?.label || "Any Score";
    default:
      return "";
  }
}

function isActive(key: string, filters: SearchFilters): boolean {
  switch (key) {
    case "genre": return filters.genre !== "any";
    case "year": return !!filters.yearMin || !!filters.yearMax;
    case "chart": return filters.chart !== "any";
    case "syncScore": return filters.syncScore !== "any";
    default: return false;
  }
}

export const AdvancedFilters = ({ filters, onChange }: AdvancedFiltersProps) => {
  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== "any" && v !== "").length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* Genre chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("genre", filters) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("genre", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="center">
            <div className="space-y-0.5">
              {GENRES.map(g => {
                const val = g.toLowerCase().replace(/[/ ]/g, "-");
                return (
                  <button key={g} onClick={() => onChange({ ...filters, genre: val })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.genre === val ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                    {g}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Year chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("year", filters) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("year", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="center">
            <div className="flex items-center gap-2">
              <Select value={filters.yearMin || "any"} onValueChange={(v) => onChange({ ...filters, yearMin: v === "any" ? "" : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="From" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">From</SelectItem>
                  {Array.from({ length: 26 }, (_, i) => String(2000 + i)).map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">–</span>
              <Select value={filters.yearMax || "any"} onValueChange={(v) => onChange({ ...filters, yearMax: v === "any" ? "" : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="To" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">To</SelectItem>
                  {Array.from({ length: 26 }, (_, i) => String(2025 - i)).map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        {/* Chart chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("chart", filters) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("chart", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="center">
            <div className="space-y-0.5">
              {CHARTS.map(c => {
                const val = c.toLowerCase().replace(/ /g, "-");
                return (
                  <button key={c} onClick={() => onChange({ ...filters, chart: val })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.chart === val ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sync Score chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("syncScore", filters) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("syncScore", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="center">
            <div className="space-y-0.5">
              {SYNC_SCORES.map(s => (
                <button key={s.value} onClick={() => onChange({ ...filters, syncScore: s.value })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.syncScore === s.value ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear all */}
        {activeCount > 0 && (
          <button onClick={() => onChange(EMPTY_FILTERS)} className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
    </div>
  );
};

export { EMPTY_FILTERS };
