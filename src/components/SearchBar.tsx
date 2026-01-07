import { useState } from "react";
import { Search, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export const SearchBar = ({ onSearch, isLoading }: SearchBarProps) => {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center gap-3">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            variant="search"
            placeholder="Paste a Spotify, Apple Music, or Tidal link..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-4"
          />
        </div>
        <Button 
          type="submit" 
          size="lg"
          disabled={isLoading || !query.trim()}
          className="h-14 px-6 rounded-xl glow-primary hover:glow-primary-intense transition-all duration-300"
        >
          <Search className="h-5 w-5 mr-2" />
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground mt-3">
        Supports Spotify, Apple Music, Tidal, Deezer, and more
      </p>
    </form>
  );
};
