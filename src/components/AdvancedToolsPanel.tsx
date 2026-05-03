import { memo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { QuickStatsWidget } from "./QuickStatsWidget";
import { AdvancedFilters, SearchFilters } from "./AdvancedFilters";
import { RegionFilter } from "./RegionFilter";
import { SearchPresetsBar } from "./SearchPresetsBar";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Deal } from "./DealsTracker";

interface AdvancedToolsPanelProps {
  history: SearchHistoryEntry[];
  deals: Deal[];
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;
  onResolveArtist?: (artistName: string) => void;
}

export const AdvancedToolsPanel = memo(({
  history,
  deals,
  filters,
  onFiltersChange,
  selectedRegions,
  onRegionsChange,
  onResolveArtist,
}: AdvancedToolsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyPreset = (presetFilters: SearchFilters, presetRegions: string[]) => {
    onFiltersChange(presetFilters);
    onRegionsChange(presetRegions);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 justify-center">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground gap-2 h-8"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {isOpen ? "Hide filters" : "Filters & insights"}
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </CollapsibleTrigger>
        <SearchPresetsBar
          currentFilters={filters}
          currentRegions={selectedRegions}
          onApplyPreset={handleApplyPreset}
        />
      </div>
      <CollapsibleContent className="mt-4 space-y-4 animate-fade-up">
        <QuickStatsWidget history={history} deals={deals} />
        <AdvancedFilters filters={filters} onChange={onFiltersChange} onResolveArtist={onResolveArtist} />
        <div className="flex justify-center">
          <RegionFilter selectedRegions={selectedRegions} onRegionsChange={onRegionsChange} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

AdvancedToolsPanel.displayName = "AdvancedToolsPanel";
