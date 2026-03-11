import { TrendingUp } from "lucide-react";

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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-secondary-foreground">
          Trending Now
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {TRENDING.map((song) => (
          <button
            key={song.title + song.artist}
            onClick={() => onSearch(`${song.artist} - ${song.title}`)}
            className="px-3 py-1.5 rounded-full border border-border/50 bg-card hover:bg-primary/5 hover:border-primary/30 transition-all text-xs group"
          >
            <span className="text-foreground font-medium group-hover:text-primary transition-colors">
              {song.title}
            </span>
            <span className="text-muted-foreground"> · {song.artist}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
