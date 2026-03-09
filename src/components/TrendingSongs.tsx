import { Music } from "lucide-react";

const TRENDING = [
  { title: "APT.", artist: "ROSÉ & Bruno Mars" },
  { title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars" },
  { title: "Birds Of A Feather", artist: "Billie Eilish" },
  { title: "luther", artist: "Kendrick Lamar & SZA" },
  { title: "Timeless", artist: "The Weeknd & Playboi Carti" },
  { title: "Good Luck, Babe!", artist: "Chappell Roan" },
  { title: "Not Like Us", artist: "Kendrick Lamar" },
  { title: "Espresso", artist: "Sabrina Carpenter" },
  { title: "Bad Blood", artist: "Taylor Swift" },
];

interface TrendingSongsProps {
  onSearch: (query: string) => void;
}

export const TrendingSongs = ({ onSearch }: TrendingSongsProps) => {
  return (
    <div className="w-full">
      <h3 className="section-label text-secondary-foreground mb-3">
        Trending in Publishing
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {TRENDING.map((song) => (
          <button
            key={song.title}
            onClick={() => onSearch(`${song.title} ${song.artist}`)}
            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border border-border/50 bg-surface hover:border-primary/30 hover:bg-surface-elevated transition-all text-sm"
          >
            <Music className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-foreground font-medium whitespace-nowrap">{song.title}</span>
            <span className="text-muted-foreground whitespace-nowrap">— {song.artist}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
