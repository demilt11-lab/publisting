import { User, Pen, Disc3, ExternalLink, Music, Globe, Twitter, Instagram, Youtube, Heart, Building2, Disc, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFavorites } from "@/hooks/useFavorites";

export type CreditRole = "artist" | "writer" | "producer";
export type PublishingStatus = "signed" | "unsigned" | "unknown";

interface CreditCardProps {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  recordLabel?: string;
  management?: string;
  ipi?: string;
  pro?: string;
  region?: string;
  regionFlag?: string;
  regionLabel?: string;
  /** Other roles this same person has on the same song (e.g. artist + writer) */
  alsoRoles?: CreditRole[];
  showFavoriteButton?: boolean;
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
  const spacedName = encodedName.replace(/%20/g, '+');
  const handleName = name.replace(/\s+/g, '').toLowerCase();
  
  return {
    music: [
      { label: "Spotify", url: `https://open.spotify.com/search/${encodedName}`, icon: Music },
      { label: "Apple Music", url: `https://music.apple.com/search?term=${encodedName}`, icon: Music },
      { label: "Tidal", url: `https://listen.tidal.com/search?q=${encodedName}`, icon: Music },
      { label: "Amazon Music", url: `https://music.amazon.com/search/${encodedName}`, icon: Music },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedName}`, icon: Youtube },
      { label: "Deezer", url: `https://www.deezer.com/search/${encodedName}`, icon: Music },
      { label: "SoundCloud", url: `https://soundcloud.com/search/people?q=${encodedName}`, icon: Music },
      { label: "Pandora", url: `https://www.pandora.com/search/${encodedName}/artists`, icon: Music },
      { label: "Audiomack", url: `https://audiomack.com/search?q=${encodedName}`, icon: Music },
      { label: "Bandcamp", url: `https://bandcamp.com/search?q=${encodedName}&item_type=b`, icon: Music },
    ],
    info: [
      { label: "Genius", url: `https://genius.com/search?q=${encodedName}`, icon: Globe },
      { label: "AllMusic", url: `https://www.allmusic.com/search/artists/${encodedName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
      { label: "Wikipedia", url: `https://en.wikipedia.org/w/index.php?search=${encodedName}`, icon: Globe },
    ],
    social: [
      { label: "Instagram", url: `https://www.instagram.com/${handleName}`, icon: Instagram },
      { label: "X (Twitter)", url: `https://x.com/${handleName}`, icon: Twitter },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${spacedName}&sp=EgIQAg%253D%253D`, icon: Youtube },
      { label: "TikTok", url: `https://www.tiktok.com/@${handleName}`, icon: Globe },
      { label: "Facebook", url: `https://www.facebook.com/search/top/?q=${encodedName}`, icon: Globe },
      { label: "LinkedIn", url: `https://www.linkedin.com/search/results/all/?keywords=${encodedName}`, icon: Globe },
    ],
  };
};

const getProStyle = (pro: string): string => {
  return proStyles[pro.toUpperCase()] || "bg-muted text-muted-foreground border-border";
};

export const CreditCard = ({ name, role, publishingStatus, publisher, recordLabel, management, ipi, pro, regionFlag, regionLabel, alsoRoles = [], showFavoriteButton = true }: CreditCardProps) => {
  const Icon = roleIcons[role];
  const externalLinks = getExternalLinks(name);
  const { toggleFavorite, isFavorite } = useFavorites();
  const isFaved = isFavorite(name, role);

  const handleFavoriteToggle = () => {
    toggleFavorite(name, role, ipi, pro, publisher);
  };

  const alsoRoleLabels = alsoRoles
    .filter((r) => r !== role)
    .map((r) => roleLabels[r]);

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
                {regionFlag && <span className="text-base" title={regionLabel}>{regionFlag}</span>}
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
          {alsoRoleLabels.map((label) => (
            <Badge key={label} variant="outline" className="text-xs">
              Also {label}
            </Badge>
          ))}
          {pro && (
            <Badge 
              variant="outline" 
              className={`text-xs font-semibold ${getProStyle(pro)}`}
            >
              {pro}
            </Badge>
          )}
        </div>
        
        {/* IPI display */}
        {ipi && (
          <div className="mt-1 text-xs text-muted-foreground font-mono">
            IPI: {ipi}
          </div>
        )}
      </div>
      
      {/* Signing Status Badges - Separate pills for each */}
      <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
        {/* Publisher Badge */}
        <Badge 
          variant={publisher ? "publisher" : "publisher-unknown"} 
          className="text-xs flex items-center gap-1"
          title={publisher || "Publisher unknown"}
        >
          <Building2 className="w-3 h-3" />
          {publisher ? (
            <span className="max-w-[220px] md:max-w-[280px] truncate" title={publisher}>{publisher}</span>
          ) : (
            <span className="opacity-60">No Pub</span>
          )}
        </Badge>
        
        {/* Label Badge - Only show for artists */}
        {role === 'artist' && (
          <Badge 
            variant={recordLabel ? "label" : "label-unknown"} 
            className="text-xs flex items-center gap-1"
            title={recordLabel || "Label unknown"}
          >
            <Disc className="w-3 h-3" />
            {recordLabel ? (
              <span className="max-w-[220px] md:max-w-[280px] truncate" title={recordLabel}>{recordLabel}</span>
            ) : (
              <span className="opacity-60">No Label</span>
            )}
          </Badge>
        )}
        
        {/* Management Badge - Only show for artists */}
        {role === 'artist' && (
          <Badge 
            variant={management ? "management" : "management-unknown"} 
            className="text-xs flex items-center gap-1"
            title={management || "Management unknown"}
          >
            <Users className="w-3 h-3" />
            {management ? (
              <span className="max-w-[220px] md:max-w-[280px] truncate" title={management}>{management}</span>
            ) : (
              <span className="opacity-60">No Mgmt</span>
            )}
          </Badge>
        )}
      </div>

      {showFavoriteButton && (
        <Button
          variant="ghost"
          size="icon"
          className={`flex-shrink-0 ${isFaved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
          onClick={handleFavoriteToggle}
          title={isFaved ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={`w-4 h-4 ${isFaved ? "fill-current" : ""}`} />
        </Button>
      )}
    </div>
  );
};
