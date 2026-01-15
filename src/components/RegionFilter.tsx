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
  { id: "GB", label: "United Kingdom", pros: ["PRS"], flag: "🇬🇧" },
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

// Comprehensive country code to flag and label mapping
export const COUNTRY_FLAGS: Record<string, { flag: string; label: string }> = {
  US: { flag: "🇺🇸", label: "United States" },
  CA: { flag: "🇨🇦", label: "Canada" },
  GB: { flag: "🇬🇧", label: "United Kingdom" },
  UK: { flag: "🇬🇧", label: "United Kingdom" },
  DE: { flag: "🇩🇪", label: "Germany" },
  FR: { flag: "🇫🇷", label: "France" },
  IT: { flag: "🇮🇹", label: "Italy" },
  ES: { flag: "🇪🇸", label: "Spain" },
  JP: { flag: "🇯🇵", label: "Japan" },
  AU: { flag: "🇦🇺", label: "Australia" },
  KR: { flag: "🇰🇷", label: "South Korea" },
  CN: { flag: "🇨🇳", label: "China" },
  IN: { flag: "🇮🇳", label: "India" },
  ZA: { flag: "🇿🇦", label: "South Africa" },
  KE: { flag: "🇰🇪", label: "Kenya" },
  NG: { flag: "🇳🇬", label: "Nigeria" },
  MX: { flag: "🇲🇽", label: "Mexico" },
  AR: { flag: "🇦🇷", label: "Argentina" },
  BR: { flag: "🇧🇷", label: "Brazil" },
  SE: { flag: "🇸🇪", label: "Sweden" },
  NO: { flag: "🇳🇴", label: "Norway" },
  NL: { flag: "🇳🇱", label: "Netherlands" },
  IE: { flag: "🇮🇪", label: "Ireland" },
  JM: { flag: "🇯🇲", label: "Jamaica" },
  PR: { flag: "🇵🇷", label: "Puerto Rico" },
  CO: { flag: "🇨🇴", label: "Colombia" },
  CL: { flag: "🇨🇱", label: "Chile" },
  PE: { flag: "🇵🇪", label: "Peru" },
  VE: { flag: "🇻🇪", label: "Venezuela" },
  BE: { flag: "🇧🇪", label: "Belgium" },
  AT: { flag: "🇦🇹", label: "Austria" },
  CH: { flag: "🇨🇭", label: "Switzerland" },
  PT: { flag: "🇵🇹", label: "Portugal" },
  PL: { flag: "🇵🇱", label: "Poland" },
  RU: { flag: "🇷🇺", label: "Russia" },
  UA: { flag: "🇺🇦", label: "Ukraine" },
  GR: { flag: "🇬🇷", label: "Greece" },
  TR: { flag: "🇹🇷", label: "Turkey" },
  IL: { flag: "🇮🇱", label: "Israel" },
  EG: { flag: "🇪🇬", label: "Egypt" },
  MA: { flag: "🇲🇦", label: "Morocco" },
  GH: { flag: "🇬🇭", label: "Ghana" },
  TZ: { flag: "🇹🇿", label: "Tanzania" },
  PH: { flag: "🇵🇭", label: "Philippines" },
  ID: { flag: "🇮🇩", label: "Indonesia" },
  MY: { flag: "🇲🇾", label: "Malaysia" },
  SG: { flag: "🇸🇬", label: "Singapore" },
  TH: { flag: "🇹🇭", label: "Thailand" },
  VN: { flag: "🇻🇳", label: "Vietnam" },
  NZ: { flag: "🇳🇿", label: "New Zealand" },
  PK: { flag: "🇵🇰", label: "Pakistan" },
  BD: { flag: "🇧🇩", label: "Bangladesh" },
  LK: { flag: "🇱🇰", label: "Sri Lanka" },
  NP: { flag: "🇳🇵", label: "Nepal" },
  AE: { flag: "🇦🇪", label: "UAE" },
  SA: { flag: "🇸🇦", label: "Saudi Arabia" },
  FI: { flag: "🇫🇮", label: "Finland" },
  DK: { flag: "🇩🇰", label: "Denmark" },
  CZ: { flag: "🇨🇿", label: "Czech Republic" },
  HU: { flag: "🇭🇺", label: "Hungary" },
  RO: { flag: "🇷🇴", label: "Romania" },
  HR: { flag: "🇭🇷", label: "Croatia" },
  RS: { flag: "🇷🇸", label: "Serbia" },
};

// Get flag and label from country code
export const getCountryInfo = (countryCode: string): { flag: string; label: string } | undefined => {
  return COUNTRY_FLAGS[countryCode.toUpperCase()];
};

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
