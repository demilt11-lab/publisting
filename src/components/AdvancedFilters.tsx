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
  catalogTier: string;
  publishingType: string;
  labelType: string;
  writersCount: string;
  adminStatus: string;
}

const EMPTY_FILTERS: SearchFilters = {
  genre: "any",
  yearMin: "",
  yearMax: "",
  chart: "any",
  catalogTier: "any",
  publishingType: "any",
  labelType: "any",
  writersCount: "any",
  adminStatus: "any",
};

const GENRES = ["Any", "Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Country", "Latin", "K-Pop", "Bollywood/Indian"];
const CHARTS = ["Any", "Billboard Hot 100", "Spotify Global Top 50", "Apple Music Top 100"];
const CATALOG_TIERS = [
  { label: "Any Tier", value: "any" },
  { label: "Excellent (80-100)", value: "excellent" },
  { label: "Good (60-79)", value: "good" },
  { label: "Fair (40-59)", value: "fair" },
  { label: "Complex (0-39)", value: "complex" },
];

const PUBLISHING_TYPES = [
  { label: "Any Publishing", value: "any" },
  { label: "Mostly Indie", value: "indie" },
  { label: "Mixed", value: "mixed" },
  { label: "Mostly Major", value: "major" },
];

const LABEL_TYPES = [
  { label: "Any Label", value: "any" },
  { label: "Indie Label", value: "indie" },
  { label: "Major Label", value: "major" },
];

const WRITERS_COUNT = [
  { label: "Any # Writers", value: "any" },
  { label: "1–3 Writers", value: "1-3" },
  { label: "4–6 Writers", value: "4-6" },
  { label: "7+ Writers", value: "7+" },
];

const ADMIN_STATUS = [
  { label: "Any Admin", value: "any" },
  { label: "Admin Known", value: "known" },
  { label: "Admin Unknown", value: "unknown" },
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
    case "catalogTier":
      return filters.catalogTier === "any" ? "Any Tier" : CATALOG_TIERS.find(s => s.value === filters.catalogTier)?.label || "Any Tier";
    case "publishingType":
      return PUBLISHING_TYPES.find(p => p.value === filters.publishingType)?.label || "Any Publishing";
    case "labelType":
      return LABEL_TYPES.find(l => l.value === filters.labelType)?.label || "Any Label";
    case "writersCount":
      return WRITERS_COUNT.find(w => w.value === filters.writersCount)?.label || "Any # Writers";
    case "adminStatus":
      return ADMIN_STATUS.find(a => a.value === filters.adminStatus)?.label || "Any Admin";
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
    case "publishingType": return filters.publishingType !== "any";
    case "labelType": return filters.labelType !== "any";
    case "writersCount": return filters.writersCount !== "any";
    case "adminStatus": return filters.adminStatus !== "any";
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

        {/* Publishing Type chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("publishingType", filters) ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("publishingType", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="center">
            <div className="space-y-0.5">
              {PUBLISHING_TYPES.map(p => (
                <button key={p.value} onClick={() => onChange({ ...filters, publishingType: p.value })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.publishingType === p.value ? "bg-emerald-500/10 text-emerald-400 font-medium" : "text-foreground hover:bg-accent"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Label Type chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("labelType", filters) ? "border-blue-500/50 bg-blue-500/10 text-blue-400" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("labelType", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="center">
            <div className="space-y-0.5">
              {LABEL_TYPES.map(l => (
                <button key={l.value} onClick={() => onChange({ ...filters, labelType: l.value })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.labelType === l.value ? "bg-blue-500/10 text-blue-400 font-medium" : "text-foreground hover:bg-accent"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Writers Count chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("writersCount", filters) ? "border-purple-500/50 bg-purple-500/10 text-purple-400" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("writersCount", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="center">
            <div className="space-y-0.5">
              {WRITERS_COUNT.map(w => (
                <button key={w.value} onClick={() => onChange({ ...filters, writersCount: w.value })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.writersCount === w.value ? "bg-purple-500/10 text-purple-400 font-medium" : "text-foreground hover:bg-accent"}`}>
                  {w.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Admin Status chip */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive("adminStatus", filters) ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
              {chipLabel("adminStatus", filters)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="center">
            <div className="space-y-0.5">
              {ADMIN_STATUS.map(a => (
                <button key={a.value} onClick={() => onChange({ ...filters, adminStatus: a.value })} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${filters.adminStatus === a.value ? "bg-amber-500/10 text-amber-400 font-medium" : "text-foreground hover:bg-accent"}`}>
                  {a.label}
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
