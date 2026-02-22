import { Music } from "lucide-react";

const TRENDING = [
  { title: "APT.", artist: "ROSÉ & Bruno Mars" },
  { title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars" },
  { title: "Birds Of A Feather", artist: "Billie Eilish" },
  { title: "luther", artist: "Kendrick Lamar & SZA" },
  { title: "Timeless", artist: "The Weeknd & Playboi Carti" },
  { title: "Good Luck, Babe!", artist: "Chappell Roan" },
];

interface TrendingSongsProps {
  onSearch: (query: string) => void;
}

export const TrendingSongs = ({ onSearch }: TrendingSongsProps) => {
  return (
    <div className="max-w-3xl mx-auto">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 tracking-wide uppercase">
        Trending in Publishing
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {TRENDING.map((song) => (
          <button
            key={song.title}
            onClick={() => onSearch(`${song.artist} - ${song.title}`)}
            className="flex-shrink-0 w-40 rounded-xl border border-border/50 bg-card/80 p-3 text-left hover:border-primary/50 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)] transition-all duration-300 group"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-2 group-hover:bg-primary/10 transition-colors">
              <Music className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm font-semibold text-foreground truncate">{song.title}</p>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
