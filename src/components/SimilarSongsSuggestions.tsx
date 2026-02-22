import { useState, useEffect } from "react";
import { Sparkles, Search, Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SimilarSong {
  id: string;
  title: string;
  artist: string;
  year?: string;
}

interface SimilarSongsSuggestionsProps {
  songTitle: string;
  artist: string;
  onSearch: (query: string) => void;
}

export const SimilarSongsSuggestions = ({ songTitle, artist, onSearch }: SimilarSongsSuggestionsProps) => {
  const [songs, setSongs] = useState<SimilarSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchSimilar = async () => {
      setLoading(true);
      setError(false);
      try {
        const encoded = encodeURIComponent(artist);
        const res = await fetch(
          `https://musicbrainz.org/ws/2/recording/?query=artist:${encoded}&limit=6&fmt=json`,
          {
            headers: { "User-Agent": "PubCheck/1.0 (https://pubcheck.app)" },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (cancelled) return;
        const results: SimilarSong[] = (data.recordings || [])
          .filter((r: any) => r.title.toLowerCase() !== songTitle.toLowerCase())
          .slice(0, 4)
          .map((r: any) => ({
            id: r.id,
            title: r.title,
            artist: r["artist-credit"]?.map((ac: any) => ac.name).join(", ") || artist,
            year: r["first-release-date"]?.slice(0, 4) || undefined,
          }));
        setSongs(results);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (songTitle && artist) fetchSimilar();
    return () => { cancelled = true; };
  }, [songTitle, artist]);

  if (error || (!loading && songs.length === 0)) return null;

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 space-y-3 animate-fade-up">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Similar Songs You May Want to License</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Finding similar songs...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {songs.map(song => (
            <div key={song.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-secondary/40 hover:bg-secondary/70 transition-colors group">
              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
              </div>
              {song.year && (
                <Badge variant="outline" className="text-[10px] shrink-0">{song.year}</Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onSearch(`${song.title} ${song.artist}`)}
                aria-label={`Search ${song.title}`}
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
