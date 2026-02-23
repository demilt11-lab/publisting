import { memo, useCallback, useState } from "react";
import { User, Pen, Disc3, ExternalLink, Music, Globe, Twitter, Instagram, Youtube, Heart, Building2, Disc, Users, PieChart, FileSpreadsheet, Copy, Check, Search as SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";

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
  alsoRoles?: CreditRole[];
  showFavoriteButton?: boolean;
  publishingShare?: number;
  shareSource?: string;
  onViewCatalog?: (name: string, role: CreditRole) => void;
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

const roleDescriptions: Record<string, string> = {
  artist: "The performing artist or featured vocalist on this track",
  writer: "Songwriter or composer — writes lyrics and/or melody. Earns publishing royalties.",
  producer: "Music producer — creates the beat, arrangement, or sonic direction of the track",
};

// PRO badge colors - distinct for major PROs
const proStyles: Record<string, { className: string; label: string }> = {
  ASCAP: { className: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "ASCAP" },
  BMI: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "BMI" },
  SESAC: { className: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "SESAC" },
  SOCAN: { className: "bg-red-500/20 text-red-400 border-red-500/30", label: "SOCAN" },
  PRS: { className: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "PRS" },
  GEMA: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "GEMA" },
  APRA: { className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "APRA" },
  JASRAC: { className: "bg-pink-500/20 text-pink-400 border-pink-500/30", label: "JASRAC" },
  SACEM: { className: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", label: "SACEM" },
};

const getExternalLinks = (name: string) => {
  const encodedName = encodeURIComponent(name);
  const spacedName = encodedName.replace(/%20/g, '+');
  const handleName = name.replace(/\s+/g, '').toLowerCase();
  const slugName = name.replace(/\s+/g, '-').toLowerCase();
  
  return {
    music: [
      { label: "Spotify", url: `https://open.spotify.com/search/${encodedName}/artists`, icon: Music },
      { label: "Apple Music", url: `https://music.apple.com/us/search?term=${encodedName}`, icon: Music },
      { label: "Tidal", url: `https://listen.tidal.com/search?q=${encodedName}`, icon: Music },
      { label: "Amazon Music", url: `https://music.amazon.com/search/${encodedName}`, icon: Music },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedName}`, icon: Youtube },
      { label: "Deezer", url: `https://www.deezer.com/search/${encodedName}/artist`, icon: Music },
      { label: "SoundCloud", url: `https://soundcloud.com/search/people?q=${encodedName}`, icon: Music },
      { label: "Pandora", url: `https://www.pandora.com/search/${encodedName}/artists`, icon: Music },
      { label: "Audiomack", url: `https://audiomack.com/search?q=${encodedName}`, icon: Music },
      { label: "Bandcamp", url: `https://bandcamp.com/search?q=${encodedName}&item_type=b`, icon: Music },
    ],
    info: [
      { label: "Genius", url: `https://genius.com/artists/${slugName}`, icon: Globe },
      { label: "AllMusic", url: `https://www.allmusic.com/search/artists/${encodedName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
      { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}`, icon: Globe },
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
  const upper = pro.toUpperCase();
  return proStyles[upper]?.className || "bg-muted text-muted-foreground border-border";
};

export const CreditCard = memo(({ name, role, publishingStatus, publisher, recordLabel, management, ipi, pro, regionFlag, regionLabel, alsoRoles = [], showFavoriteButton = true, publishingShare, shareSource, onViewCatalog }: CreditCardProps) => {
  const Icon = roleIcons[role];
  const externalLinks = getExternalLinks(name);
  const { toggleFavorite, isFavorite } = useFavorites();
  const isFaved = isFavorite(name, role);
  const [ipiCopied, setIpiCopied] = useState(false);
  const { toast } = useToast();

  const handleFavoriteToggle = useCallback(() => {
    toggleFavorite(name, role, ipi, pro, publisher);
  }, [name, role, ipi, pro, publisher, toggleFavorite]);

  const handleCopyIpi = useCallback(() => {
    if (!ipi) return;
    navigator.clipboard.writeText(ipi).then(() => {
      setIpiCopied(true);
      toast({ title: "IPI copied!" });
      setTimeout(() => setIpiCopied(false), 2000);
    }).catch(() => {});
  }, [ipi, toast]);

  const alsoRoleLabels = alsoRoles
    .filter((r) => r !== role)
    .map((r) => roleLabels[r]);

  return (
    <div
      className={`glass glass-hover rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 animate-fade-up ${onViewCatalog ? 'cursor-pointer' : ''}`}
      onClick={() => onViewCatalog?.(name, role)}
    >
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1 group text-sm sm:text-base">
                {regionFlag && <span className="text-base" title={regionLabel}>{regionFlag}</span>}
                {name}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Music Platforms</DropdownMenuLabel>
              {externalLinks.music.map((link) => (
                <DropdownMenuItem key={link.label} asChild>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
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
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
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
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                    <link.icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className={`text-xs cursor-help font-semibold ${
                  role === "writer" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                  role === "producer" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                  "bg-primary/20 text-primary border-primary/30"
                }`}>
                  {roleLabels[role]}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {roleDescriptions[role]}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          {publishingShare !== undefined && publishingShare > 0 && (
            <Badge 
              variant="outline" 
              className="text-xs font-semibold bg-violet-500/20 text-violet-400 border-violet-500/30 flex items-center gap-1"
              title={`Publishing share: ${publishingShare}%${shareSource ? ` (via ${shareSource})` : ''}`}
            >
              <PieChart className="w-3 h-3" />
              {publishingShare}%
            </Badge>
          )}
        </div>
        
        {/* IPI display - prominent copyable pill */}
        {ipi && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyIpi(); }}
                className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/60 border border-border/50 text-xs font-mono text-foreground hover:bg-accent transition-colors"
              >
                {ipiCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                IPI: {ipi}
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-[200px]">IPI = Interested Parties Information number. Click to copy.</TooltipContent>
          </Tooltip>
        )}
      </div>
      
      {/* Signing Status Badges */}
      <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
        <Badge 
          variant={publisher ? "publisher" : "publisher-unknown"} 
          className="text-xs flex items-center gap-1"
          title={publisher || "Publisher unknown"}
        >
          <Building2 className="w-3 h-3" />
          {publisher ? (
            <span className="max-w-[140px] sm:max-w-[220px] md:max-w-[280px] truncate" title={publisher}>{publisher}</span>
          ) : (
            <span className="opacity-50 italic text-[10px]">Publisher unknown</span>
          )}
        </Badge>
        
        {role === 'artist' && (
          <Badge 
            variant={recordLabel ? "label" : "label-unknown"} 
            className="text-xs flex items-center gap-1"
            title={recordLabel || "Label unknown"}
          >
            <Disc className="w-3 h-3" />
            {recordLabel ? (
              <span className="max-w-[140px] sm:max-w-[220px] md:max-w-[280px] truncate" title={recordLabel}>{recordLabel}</span>
            ) : (
              <span className="opacity-50 italic text-[10px]">Independent</span>
            )}
          </Badge>
        )}
        
        {role === 'artist' && (
          <Badge 
            variant={management ? "management" : "management-unknown"} 
            className="text-xs flex items-center gap-1"
            title={management || "Management unknown"}
          >
            <Users className="w-3 h-3" />
            {management ? (
              <span className="max-w-[140px] sm:max-w-[220px] md:max-w-[280px] truncate" title={management}>{management}</span>
            ) : (
              <span className="opacity-50 italic text-[10px]">Self-managed</span>
            )}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* PRO registry search link */}
        {pro && (() => {
          const upper = pro.toUpperCase();
          let proUrl: string | null = null;
          if (upper === "ASCAP") proUrl = `https://www.ascap.com/repertory?searchMode=writer&searchValue=${encodeURIComponent(name)}`;
          else if (upper === "BMI") proUrl = `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(name)}&Main_Search=Catalog&Search_Type=multi`;
          else if (upper === "SESAC") proUrl = `https://www.sesac.com/#!/repertory/search?query=${encodeURIComponent(name)}`;
          if (proUrl) return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-primary w-8 h-8"
                  onClick={() => window.open(proUrl!, '_blank')}
                >
                  <SearchIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Search {pro} registry</TooltipContent>
            </Tooltip>
          );
          return null;
        })()}
        {onViewCatalog && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary w-8 h-8" onClick={() => onViewCatalog(name, role)}>
                <FileSpreadsheet className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">View Artist Catalog</TooltipContent>
          </Tooltip>
        )}
        {showFavoriteButton && (
          <Button
            variant="ghost"
            size="icon"
            className={`w-8 h-8 ${isFaved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            onClick={handleFavoriteToggle}
            title={isFaved ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`w-4 h-4 ${isFaved ? "fill-current" : ""}`} />
          </Button>
        )}
      </div>
    </div>
  );
});

CreditCard.displayName = "CreditCard";
