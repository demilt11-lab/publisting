import { Music } from "lucide-react";

interface SongCardProps {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  releaseDate?: string;
}

export const SongCard = ({ title, artist, album, coverUrl, releaseDate }: SongCardProps) => {
  return (
    <div className="glass rounded-2xl p-6 flex gap-6 items-start animate-fade-up">
      <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
        {coverUrl ? (
          <img 
            src={coverUrl} 
            alt={`${title} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>
      
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-2xl font-bold text-foreground truncate">{title}</h2>
        <p className="text-lg text-primary font-medium mt-1">{artist}</p>
        <p className="text-muted-foreground mt-1">{album}</p>
        {releaseDate && (
          <p className="text-sm text-muted-foreground mt-2">Released: {releaseDate}</p>
        )}
      </div>
    </div>
  );
};
