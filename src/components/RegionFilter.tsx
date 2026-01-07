import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface RegionOption {
  id: string;
  label: string;
  pros: string[];
  flag: string;
}

export const REGIONS: RegionOption[] = [
  { id: "US", label: "United States", pros: ["ASCAP", "BMI", "SESAC", "The MLC"], flag: "🇺🇸" },
  { id: "CA", label: "Canada", pros: ["SOCAN"], flag: "🇨🇦" },
  { id: "UK", label: "United Kingdom", pros: ["PRS"], flag: "🇬🇧" },
  { id: "DE", label: "Germany", pros: ["GEMA"], flag: "🇩🇪" },
  { id: "FR", label: "France", pros: ["SACEM"], flag: "🇫🇷" },
  { id: "IT", label: "Italy", pros: ["SIAE"], flag: "🇮🇹" },
  { id: "ES", label: "Spain", pros: ["SGAE"], flag: "🇪🇸" },
  { id: "JP", label: "Japan", pros: ["JASRAC"], flag: "🇯🇵" },
  { id: "AU", label: "Australia", pros: ["APRA AMCOS"], flag: "🇦🇺" },
  { id: "KR", label: "South Korea", pros: ["KOMCA"], flag: "🇰🇷" },
  { id: "CN", label: "China", pros: ["MCSC"], flag: "🇨🇳" },
  { id: "IN", label: "India", pros: ["IPRS", "PPL India"], flag: "🇮🇳" },
  { id: "ZA", label: "South Africa", pros: ["SAMRO", "CAPASSO"], flag: "🇿🇦" },
  { id: "KE", label: "Kenya", pros: ["MCSK"], flag: "🇰🇪" },
  { id: "NG", label: "Nigeria", pros: ["COSON"], flag: "🇳🇬" },
  { id: "MX", label: "Mexico", pros: ["SACM"], flag: "🇲🇽" },
  { id: "AR", label: "Argentina", pros: ["SADAIC"], flag: "🇦🇷" },
  { id: "BR", label: "Brazil", pros: ["UBC"], flag: "🇧🇷" },
];

interface RegionFilterProps {
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;
}

export const RegionFilter = ({ selectedRegions, onRegionsChange }: RegionFilterProps) => {
  const toggleRegion = (regionId: string) => {
    if (selectedRegions.includes(regionId)) {
      onRegionsChange(selectedRegions.filter(r => r !== regionId));
    } else {
      onRegionsChange([...selectedRegions, regionId]);
    }
  };

  const selectAll = () => {
    onRegionsChange(REGIONS.map(r => r.id));
  };

  const clearAll = () => {
    onRegionsChange([]);
  };

  const selectedCount = selectedRegions.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Globe className="w-4 h-4" />
          Regions
          {selectedCount > 0 && selectedCount < REGIONS.length && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {selectedCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filter by Region</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                All
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-2 space-y-1">
            {REGIONS.map((region) => (
              <div
                key={region.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 cursor-pointer"
                onClick={() => toggleRegion(region.id)}
              >
                <Checkbox
                  id={region.id}
                  checked={selectedRegions.includes(region.id)}
                  onCheckedChange={() => toggleRegion(region.id)}
                />
                <span className="text-lg">{region.flag}</span>
                <div className="flex-1 min-w-0">
                  <Label htmlFor={region.id} className="text-sm cursor-pointer">
                    {region.label}
                  </Label>
                  <p className="text-xs text-muted-foreground truncate">
                    {region.pros.join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

// Helper to get region info from PRO name
export const getRegionFromPro = (pro: string): RegionOption | undefined => {
  return REGIONS.find(r => r.pros.some(p => p.toUpperCase() === pro.toUpperCase()));
};

// Get all PROs from selected regions
export const getProsFromRegions = (regionIds: string[]): string[] => {
  return REGIONS
    .filter(r => regionIds.includes(r.id))
    .flatMap(r => r.pros);
};
