import { useState } from "react";
import { Bookmark, Plus, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearchPresets, SearchPreset } from "@/hooks/useSearchPresets";
import { SearchFilters } from "@/components/AdvancedFilters";

interface SearchPresetsBarProps {
  currentFilters: SearchFilters;
  currentRegions: string[];
  onApplyPreset: (filters: SearchFilters, regions: string[]) => void;
}

export const SearchPresetsBar = ({ currentFilters, currentRegions, onApplyPreset }: SearchPresetsBarProps) => {
  const { presets, savePreset, usePreset, deletePreset } = useSearchPresets();
  const [newName, setNewName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const handleSave = async () => {
    if (!newName.trim()) return;
    await savePreset(newName, currentFilters, currentRegions);
    setNewName("");
    setShowSave(false);
  };

  const handleApply = async (preset: SearchPreset) => {
    const { filters, regions } = await usePreset(preset);
    onApplyPreset(filters, regions);
  };

  const activeFilterCount = Object.values(currentFilters).filter(v => v && v !== "any" && v !== "").length + (currentRegions.length > 0 ? 1 : 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
            <Bookmark className="w-3 h-3" />
            Presets
            {presets.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{presets.length}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="space-y-1">
            {presets.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No saved presets yet.</p>
            ) : (
              presets.map(preset => (
                <div key={preset.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50 group">
                  <button className="flex-1 text-left" onClick={() => handleApply(preset)}>
                    <p className="text-xs font-medium text-foreground">{preset.name}</p>
                    <p className="text-[10px] text-muted-foreground">Used {preset.usage_count}×</p>
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleApply(preset)}>
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => deletePreset(preset.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {activeFilterCount > 0 && !showSave && (
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => setShowSave(true)}>
          <Plus className="w-3 h-3" />
          Save Current ({activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""})
        </Button>
      )}

      {showSave && (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Preset name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="text-xs h-7 w-40"
            onKeyDown={e => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <Button size="sm" className="text-xs h-7" onClick={handleSave} disabled={!newName.trim()}>Save</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowSave(false)}>×</Button>
        </div>
      )}
    </div>
  );
};
