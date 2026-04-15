import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Music, Globe, Instagram, Youtube, Save, Loader2 } from "lucide-react";
import { updatePersonLinks, PersonLink } from "@/lib/api/peopleEnrichment";
import { useToast } from "@/hooks/use-toast";

interface EditLinksDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  personId: string | null;
  currentLinks: PersonLink[];
  onLinksUpdated: (links: PersonLink[]) => void;
}

const PLATFORM_CONFIG = [
  { key: "spotify", label: "Spotify", icon: Music, placeholder: "https://open.spotify.com/artist/..." },
  { key: "apple_music", label: "Apple Music", icon: Music, placeholder: "https://music.apple.com/us/artist/..." },
  { key: "tidal", label: "Tidal", icon: Music, placeholder: "https://tidal.com/browse/artist/..." },
  { key: "amazon_music", label: "Amazon Music", icon: Music, placeholder: "https://music.amazon.com/artists/..." },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@..." },
  { key: "youtube_music", label: "YouTube Music", icon: Youtube, placeholder: "https://music.youtube.com/channel/..." },
  { key: "deezer", label: "Deezer", icon: Music, placeholder: "https://deezer.com/artist/..." },
  { key: "soundcloud", label: "SoundCloud", icon: Music, placeholder: "https://soundcloud.com/..." },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/..." },
  { key: "tiktok", label: "TikTok", icon: Globe, placeholder: "https://tiktok.com/@..." },
  { key: "twitter", label: "X (Twitter)", icon: Globe, placeholder: "https://x.com/..." },
  { key: "facebook", label: "Facebook", icon: Globe, placeholder: "https://facebook.com/..." },
  { key: "website", label: "Website", icon: Globe, placeholder: "https://..." },
];

export function EditLinksDrawer({ open, onOpenChange, personName, personId, currentLinks, onLinksUpdated }: EditLinksDrawerProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Build initial values from current links (manual first, then automated)
  const getInitialValues = () => {
    const values: Record<string, string> = {};
    for (const platform of PLATFORM_CONFIG) {
      // Find best link: manual > highest confidence
      const manualLink = currentLinks.find(l => l.platform === platform.key && l.source === "manual");
      const autoLink = currentLinks.find(l => l.platform === platform.key && l.source !== "manual");
      values[platform.key] = manualLink?.url || autoLink?.url || "";
    }
    return values;
  };

  const [values, setValues] = useState<Record<string, string>>(getInitialValues);

  // Reset values when drawer opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setValues(getInitialValues());
    }
    onOpenChange(isOpen);
  };

  const getSourceBadge = (platform: string) => {
    const link = currentLinks.find(l => l.platform === platform);
    if (!link) return null;
    const colors: Record<string, string> = {
      manual: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      musicbrainz: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      odesli: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      spotify_api: "bg-green-500/20 text-green-400 border-green-500/30",
    };
    return (
      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${colors[link.source] || "bg-muted text-muted-foreground"}`}>
        {link.source === "manual" ? "Manual" : link.source}
      </Badge>
    );
  };

  const handleSave = async () => {
    if (!personId) {
      toast({ title: "Cannot save", description: "Person not yet enriched. Try searching first.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const linksToSave = Object.entries(values)
        .filter(([, url]) => url.trim().length > 0)
        .map(([platform, url]) => ({ platform, url: url.trim() }));

      const updated = await updatePersonLinks(personId, linksToSave);
      onLinksUpdated(updated);
      toast({ title: "Links saved", description: `Updated ${linksToSave.length} links for ${personName}.` });
      onOpenChange(false);
    } catch {
      toast({ title: "Save failed", description: "Could not update links.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[400px] sm:w-[450px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Edit Links — {personName}</SheetTitle>
          <SheetDescription className="text-xs">
            Add or correct platform URLs. Manual links always override automated ones.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-6">
          {PLATFORM_CONFIG.map((platform) => {
            const PlatformIcon = platform.icon;
            return (
              <div key={platform.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <PlatformIcon className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">{platform.label}</Label>
                  {getSourceBadge(platform.key)}
                </div>
                <Input
                  type="url"
                  placeholder={platform.placeholder}
                  value={values[platform.key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [platform.key]: e.target.value }))}
                  className="text-sm h-9"
                />
              </div>
            );
          })}
        </div>

        <SheetFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !personId}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Links
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
