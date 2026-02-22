import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Link as LinkIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const STREAMING_URL_PATTERNS = [
  /spotify\.com/i,
  /spotify\.link/i,
  /music\.apple\.com/i,
  /tidal\.com/i,
  /deezer\.com/i,
  /deezer\.page\.link/i,
  /music\.youtube\.com/i,
  /youtube\.com\/watch/i,
  /youtu\.be/i,
  /soundcloud\.com/i,
];

function looksLikeStreamingUrl(text: string): boolean {
  return STREAMING_URL_PATTERNS.some((p) => p.test(text));
}

const PLACEHOLDERS = [
  "Paste a Spotify, Apple Music, or Tidal link...",
  "Try: open.spotify.com/track/...",
  "Try: music.apple.com/us/album/...",
  "Or just type a song name + artist",
  "Try: deezer.com/track/... or YouTube Music",
];

export const SearchBar = ({ onSearch, onCancel, isLoading }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated placeholder rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = useCallback(() => {
    setQuery("");
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text").trim();
      if (pasted && looksLikeStreamingUrl(pasted)) {
        // Auto-trigger search after a short debounce
        if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
        pasteDebounceRef.current = setTimeout(() => {
          onSearch(pasted);
        }, 300);
      }
    },
    [onSearch]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            variant="search"
            placeholder={PLACEHOLDERS[placeholderIdx]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPaste={handlePaste}
            className="pl-12 pr-10"
          />
          {query && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isLoading ? (
          <Button 
            type="button"
            size="lg"
            variant="destructive"
            onClick={onCancel}
            className="h-14 px-6 rounded-xl transition-all duration-300"
          >
            <X className="h-5 w-5 mr-2" />
            Cancel
          </Button>
        ) : (
          <Button 
            type="submit" 
            size="lg"
            disabled={!query.trim()}
            className="h-14 px-6 rounded-xl glow-primary hover:glow-primary-intense transition-all duration-300"
          >
            <Search className="h-5 w-5 mr-2" />
            Search
          </Button>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground mt-3">
        Supports Spotify, Apple Music, Tidal, Deezer, YouTube Music, and more
      </p>
    </form>
  );
};
