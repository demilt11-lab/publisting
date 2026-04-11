import { memo, forwardRef } from "react";
import { RotateCcw, Building2, Disc, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditFilters, DEFAULT_CREDIT_FILTERS } from "@/hooks/useFilterPreferences";

interface CreditsFilterBarProps {
  filters: CreditFilters;
  onChange: (filters: CreditFilters) => void;
  onReset: () => void;
}

const PUB_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pub_signed", label: "Signed" },
  { value: "pub_unsigned", label: "Unsigned" },
  { value: "pub_unknown", label: "Unknown" },
];

const LABEL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "label_signed", label: "Signed" },
  { value: "label_unsigned", label: "Unsigned" },
  { value: "label_unknown", label: "Unknown" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "artists", label: "Artists" },
  { value: "writers", label: "Writers" },
  { value: "producers", label: "Producers" },
];

const isDefault = (filters: CreditFilters) =>
  filters.pubStatus === "all" &&
  filters.labelStatus === "all" &&
  filters.roleFilter === "all";

export const CreditsFilterBar = memo(forwardRef<HTMLDivElement, CreditsFilterBarProps>(({ filters, onChange, onReset }, ref) => {
  return (
    <div ref={ref} className="flex items-center gap-2 flex-wrap p-3 rounded-lg border border-border/50 bg-surface sticky top-0 z-10">
      {/* Publishing Status */}
      <div className="flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <Select
          value={filters.pubStatus}
          onValueChange={(v) => onChange({ ...filters, pubStatus: v as CreditFilters["pubStatus"] })}
        >
          <SelectTrigger className="h-7 text-xs w-[120px] bg-background">
            <SelectValue placeholder="Publishing" />
          </SelectTrigger>
          <SelectContent>
            {PUB_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Label Status */}
      <div className="flex items-center gap-1.5">
        <Disc className="w-3.5 h-3.5 text-muted-foreground" />
        <Select
          value={filters.labelStatus}
          onValueChange={(v) => onChange({ ...filters, labelStatus: v as CreditFilters["labelStatus"] })}
        >
          <SelectTrigger className="h-7 text-xs w-[120px] bg-background">
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            {LABEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Role */}
      <div className="flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <Select
          value={filters.roleFilter}
          onValueChange={(v) => onChange({ ...filters, roleFilter: v as CreditFilters["roleFilter"] })}
        >
          <SelectTrigger className="h-7 text-xs w-[110px] bg-background">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset */}
      {!isDefault(filters) && (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={onReset}>
          <RotateCcw className="w-3 h-3" />
          Reset filters
        </Button>
      )}
    </div>
  );
}));

CreditsFilterBar.displayName = "CreditsFilterBar";
