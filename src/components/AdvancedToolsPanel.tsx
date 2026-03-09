import { memo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { QuickStatsWidget } from "./QuickStatsWidget";
import { AdvancedFilters, SearchFilters } from "./AdvancedFilters";
import { RegionFilter } from "./RegionFilter";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Deal } from "./DealsTracker";

interface AdvancedToolsPanelProps {
  history: SearchHistoryEntry[];
  deals: Deal[];
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;
}

export const AdvancedToolsPanel = memo(({
  history,
  deals,
  filters,
  onFiltersChange,
  selectedRegions,
  onRegionsChange,
}: AdvancedToolsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-foreground gap-2 h-8"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {isOpen ? "Hide advanced filters & insights" : "Show advanced filters & insights"}
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-4 animate-fade-up">
        <QuickStatsWidget history={history} deals={deals} />
        <AdvancedFilters filters={filters} onChange={onFiltersChange} />
        <div className="flex justify-center">
          <RegionFilter selectedRegions={selectedRegions} onRegionsChange={onRegionsChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

AdvancedToolsPanel.displayName = "AdvancedToolsPanel";
