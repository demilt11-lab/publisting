import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Link as LinkIcon, X, Loader2, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

interface MBSuggestion {
  id: string;
  title: string;
  artist: string;
}

const STREAMING_URL_PATTERNS = [
  /spotify\.com/i,
  /spotify\.link/i,
  /spotify:track:/i,
  /music\.apple\.com/i,
  /itunes\.apple\.com/i,
  /tidal\.com/i,
  /deezer\.com/i,
  /deezer\.page\.link/i,
  /music\.youtube\.com/i,
  /youtube\.com\/watch/i,
  /youtu\.be/i,
  /soundcloud\.com/i,
  /music\.amazon\.com/i,
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
  "Try: music.amazon.com/...",
  "Try: music.youtube.com/watch?v=...",
];

function highlightMatch(text: string, query: string): string {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
}

export const SearchBar = ({ onSearch, onCancel, isLoading }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<MBSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated placeholder rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // "/" keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced MusicBrainz autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 3 || looksLikeStreamingUrl(trimmed)) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const encoded = encodeURIComponent(trimmed);
        const res = await fetch(
          `https://musicbrainz.org/ws/2/recording/?query=${encoded}&limit=5&fmt=json`,
          {
            headers: { "User-Agent": "PubCheck/1.0 (https://pubcheck.app)" },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) throw new Error("MusicBrainz error");
        const data = await res.json();
        const recordings: MBSuggestion[] = (data.recordings || [])
          .slice(0, 5)
          .map((r: any) => ({
            id: r.id,
            title: r.title,
            artist: r["artist-credit"]?.map((ac: any) => ac.name).join(", ") || "Unknown",
          }));
        setSuggestions(recordings);
        setShowSuggestions(recordings.length > 0);
        setSelectedIdx(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setShowSuggestions(false);
      onSearch(trimmed);
    }
  };

  const handleSuggestionClick = (s: MBSuggestion) => {
    const searchQuery = `${s.artist} - ${s.title}`;
    setQuery(searchQuery);
    setShowSuggestions(false);
    onSearch(searchQuery);
  };

  const handleClear = useCallback(() => {
    setQuery("");
    setShowSuggestions(false);
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text").trim();
      if (pasted && looksLikeStreamingUrl(pasted)) {
        if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
        pasteDebounceRef.current = setTimeout(() => {
          onSearch(pasted);
        }, 300);
      }
    },
    [onSearch]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      // Allow Escape to close even with no suggestions showing
      if (e.key === "Escape") {
        e.preventDefault();
        inputRef.current?.blur();
        return;
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[selectedIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          {isLoading ? (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
          ) : (
            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          )}
          <Input
            ref={inputRef}
            variant="search"
            placeholder={PLACEHOLDERS[placeholderIdx]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0 && query.trim().length >= 3) setShowSuggestions(true);
            }}
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
          {/* Keyboard hint */}
          {!query && !isLoading && (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border/60 text-[10px] text-muted-foreground/50 font-mono">
              /
            </kbd>
          )}

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-fade-up"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors ${
                    i === selectedIdx ? "bg-accent" : ""
                  }`}
                >
                  <Music className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatch(s.title, query.trim()),
                      }}
                    />
                    <p className="text-xs text-muted-foreground truncate"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatch(s.artist, query.trim()),
                      }}
                    />
                  </div>
                </button>
              ))}
              {loadingSuggestions && (
                <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </div>
              )}
            </div>
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
        Supports Spotify, Apple Music, Tidal, Deezer, YouTube Music, Amazon Music, and more
      </p>
    </form>
  );
};
