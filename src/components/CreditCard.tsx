import { User, Pen, Disc3, ExternalLink, Music, Globe, Twitter, Instagram, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CreditRole = "artist" | "writer" | "producer";
export type PublishingStatus = "signed" | "unsigned" | "unknown";

interface CreditCardProps {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  ipi?: string;
  pro?: string;
}

const roleIcons = {
  artist: User,
  writer: Pen,
  producer: Disc3,
};

const roleLabels = {
  artist: "Artist",
  writer: "Writer",
  producer: "Producer",
};

const statusLabels: Record<PublishingStatus, string> = {
  signed: "Signed",
  unsigned: "Unsigned",
  unknown: "Unknown",
};

// PRO badge colors - distinct for major PROs
const proStyles: Record<string, string> = {
  ASCAP: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  BMI: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  SESAC: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  PRS: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  GEMA: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  SOCAN: "bg-red-500/20 text-red-400 border-red-500/30",
  APRA: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  JASRAC: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  IPRS: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  SAMRO: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  SACEM: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SIAE: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  KOMCA: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  SACM: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

const getExternalLinks = (name: string) => {
  const encodedName = encodeURIComponent(name);
  const searchName = encodedName.replace(/%20/g, '-');
  const spacedName = encodedName.replace(/%20/g, '+');
  
  return {
    music: [
      { label: "Spotify", url: `https://open.spotify.com/search/${encodedName}`, icon: Music },
      { label: "Apple Music", url: `https://music.apple.com/search?term=${encodedName}`, icon: Music },
      { label: "Tidal", url: `https://listen.tidal.com/search?q=${encodedName}`, icon: Music },
      { label: "Amazon Music", url: `https://music.amazon.com/search/${encodedName}`, icon: Music },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedName}`, icon: Youtube },
      { label: "Deezer", url: `https://www.deezer.com/search/${encodedName}`, icon: Music },
      { label: "SoundCloud", url: `https://soundcloud.com/search?q=${encodedName}`, icon: Music },
      { label: "Pandora", url: `https://www.pandora.com/search/${encodedName}/artists`, icon: Music },
      { label: "Audiomack", url: `https://audiomack.com/search?q=${encodedName}`, icon: Music },
      { label: "Bandcamp", url: `https://bandcamp.com/search?q=${encodedName}`, icon: Music },
    ],
    info: [
      { label: "Genius", url: `https://genius.com/artists/${searchName}`, icon: Globe },
      { label: "AllMusic", url: `https://www.allmusic.com/search/artists/${encodedName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
      { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}`, icon: Globe },
    ],
    social: [
      { label: "Instagram", url: `https://www.instagram.com/${name.toLowerCase().replace(/\s+/g, '')}`, icon: Instagram },
      { label: "X (Twitter)", url: `https://twitter.com/search?q=${encodedName}&src=typed_query`, icon: Twitter },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${spacedName}`, icon: Youtube },
      { label: "TikTok", url: `https://www.tiktok.com/search?q=${encodedName}`, icon: Globe },
      { label: "Facebook", url: `https://www.facebook.com/search/top?q=${encodedName}`, icon: Globe },
      { label: "LinkedIn", url: `https://www.linkedin.com/search/results/all/?keywords=${encodedName}`, icon: Globe },
    ],
  };
};

const getProStyle = (pro: string): string => {
  return proStyles[pro.toUpperCase()] || "bg-muted text-muted-foreground border-border";
};

export const CreditCard = ({ name, role, publishingStatus, publisher, ipi, pro }: CreditCardProps) => {
  const Icon = roleIcons[role];
  const externalLinks = getExternalLinks(name);

  return (
    <div className="glass glass-hover rounded-xl p-4 flex items-center gap-4 animate-fade-up">
      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1 group">
                {name}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Music Platforms</DropdownMenuLabel>
              {externalLinks.music.map((link) => (
                <DropdownMenuItem key={link.label} asChild>
                  <a 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <link.icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              ))}
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Info & Credits</DropdownMenuLabel>
              {externalLinks.info.map((link) => (
                <DropdownMenuItem key={link.label} asChild>
                  <a 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <link.icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              ))}
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Social Media</DropdownMenuLabel>
              {externalLinks.social.map((link) => (
                <DropdownMenuItem key={link.label} asChild>
                  <a 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <link.icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Badge variant="secondary" className="text-xs">
            {roleLabels[role]}
          </Badge>
          {pro && (
            <Badge 
              variant="outline" 
              className={`text-xs font-semibold ${getProStyle(pro)}`}
            >
              {pro}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          {publisher && <span>{publisher}</span>}
          {ipi && <span className="font-mono">IPI: {ipi}</span>}
        </div>
      </div>
      
      <Badge variant={publishingStatus} className="flex-shrink-0">
        {statusLabels[publishingStatus]}
      </Badge>
    </div>
  );
};
