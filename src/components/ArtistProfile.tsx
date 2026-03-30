import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Music, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MBRecording {
  id: string;
  title: string;
  year: string;
}

interface ArtistProfileProps {
  artistName: string;
  coverUrl?: string;
  open: boolean;
  onClose: () => void;
  onCheckCredits: (query: string) => void;
  onOpenCatalog: (name: string) => void;
}

export const ArtistProfile = ({ artistName, coverUrl, open, onClose, onCheckCredits, onOpenCatalog }: ArtistProfileProps) => {
  const [recordings, setRecordings] = useState<MBRecording[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRecordings = useCallback(async () => {
    if (!artistName) return;
    setIsLoading(true);
    try {
      const encoded = encodeURIComponent(artistName);
      const res = await fetch(
        `https://musicbrainz.org/ws/2/recording/?query=artist:${encoded}&limit=15&fmt=json`,
        { headers: { "User-Agent": "Publisting/1.0 (https://publisting.app)" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTotalCount(data.count || 0);
      const recs: MBRecording[] = (data.recordings || []).slice(0, 15).map((r: any) => ({
        id: r.id,
        title: r.title,
        year: r["first-release-date"]?.slice(0, 4) || "—",
      }));
      // Deduplicate by title
      const seen = new Set<string>();
      const unique = recs.filter(r => {
        const key = r.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setRecordings(unique);
    } catch {
      setRecordings([]);
    } finally {
      setIsLoading(false);
    }
  }, [artistName]);

  useEffect(() => {
    if (open) fetchRecordings();
  }, [open, fetchRecordings]);

  const handleCheck = (title: string) => {
    onClose();
    onCheckCredits(`${artistName} - ${title}`);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} modal={false}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" /> Artist Profile
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Artist header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
              {coverUrl ? (
                <img src={coverUrl} alt={artistName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold text-foreground truncate">{artistName}</h3>
              {totalCount > 0 && (
                <p className="text-xs text-muted-foreground">{totalCount.toLocaleString()} recordings on MusicBrainz</p>
              )}
            </div>
          </div>

          {/* Open Catalog button */}
          <Button variant="outline" size="sm" className="w-full" onClick={() => { onClose(); onOpenCatalog(artistName); }}>
            <ExternalLink className="w-4 h-4 mr-1.5" /> Open Full Catalog
          </Button>

          {/* Recordings */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No recordings found.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium mb-2">Songs ({recordings.length})</p>
              {recordings.map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.year}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                    onClick={() => handleCheck(r.title)}
                  >
                    <Search className="w-3 h-3 mr-1" /> Check Credits
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
