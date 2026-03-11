import { memo, useCallback, useState } from "react";
import { User, Pen, Disc3, ExternalLink, Music, Globe, Twitter, Instagram, Youtube, Heart, Building2, Disc, Users, PieChart, FileSpreadsheet, Copy, Check, Search as SearchIcon, Eye, EyeOff } from "lucide-react";
import { getExternalLinks } from "@/lib/externalLinks";
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
import { useWatchlist, WatchlistEntityType } from "@/hooks/useWatchlist";
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
  source?: string;
  region?: string;
  regionFlag?: string;
  regionLabel?: string;
  alsoRoles?: CreditRole[];
  showFavoriteButton?: boolean;
  publishingShare?: number;
  shareSource?: string;
  onViewCatalog?: (name: string, role: CreditRole) => void;
  songTitle?: string;
  songArtist?: string;
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


const getProStyle = (pro: string): string => {
  const upper = pro.toUpperCase();
  return proStyles[upper]?.className || "bg-muted text-muted-foreground border-border";
};

const sourceStyles: Record<string, { className: string; label: string }> = {
  MusicBrainz: { className: "bg-blue-500/15 text-blue-400 border-blue-500/25", label: "MusicBrainz" },
  Genius: { className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", label: "Genius" },
  Discogs: { className: "bg-orange-500/15 text-orange-400 border-orange-500/25", label: "Discogs" },
  "Apple Music": { className: "bg-pink-500/15 text-pink-400 border-pink-500/25", label: "Apple Music" },
  Spotify: { className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", label: "Spotify" },
};

export const CreditCard = memo(({ name, role, publishingStatus, publisher, recordLabel, management, ipi, pro, source, regionFlag, regionLabel, alsoRoles = [], showFavoriteButton = true, publishingShare, shareSource, onViewCatalog, songTitle, songArtist }: CreditCardProps) => {
  const Icon = roleIcons[role];
  const externalLinks = getExternalLinks(name);
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToWatchlist, isInWatchlist } = useWatchlist();
  const isFaved = isFavorite(name, role);
  const [ipiCopied, setIpiCopied] = useState(false);
  const { toast } = useToast();

  // Determine watchlist type
  const watchlistType: WatchlistEntityType = role === "artist" ? "artist" : role === "writer" ? "writer" : "producer";
  const isWatched = isInWatchlist(name, watchlistType);

  // Check if publisher/label is major
  const majorPubs = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];
  const majorLabels = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];
  const isMajorPublisher = publisher ? majorPubs.some(m => publisher.toLowerCase().includes(m)) : false;
  const isMajorLabel = recordLabel ? majorLabels.some(m => recordLabel.toLowerCase().includes(m)) : false;

  const handleAddToWatchlist = useCallback(() => {
    if (!songTitle || !songArtist) return;
    addToWatchlist(
      name,
      watchlistType,
      { songTitle, artist: songArtist },
      { pro, ipi, isMajor: isMajorPublisher || isMajorLabel }
    );
    toast({ title: "Added to Watchlist", description: `${name} is now being tracked.` });
  }, [name, watchlistType, songTitle, songArtist, pro, ipi, isMajorPublisher, isMajorLabel, addToWatchlist, toast]);

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
      className={`surface glass-hover rounded-lg p-3 sm:p-4 flex items-center gap-3 sm:gap-4 animate-fade-up ${onViewCatalog ? 'cursor-pointer' : ''}`}
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
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Find Contacts</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + " manager music")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                  <User className="w-4 h-4" />
                  <span>Find Manager</span>
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </a>
              </DropdownMenuItem>
              {publisher && (
                <DropdownMenuItem asChild>
                  <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + " " + publisher + " A&R")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                    <Building2 className="w-4 h-4" />
                    <span>Find Publisher A&R</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              )}
              {recordLabel && (
                <DropdownMenuItem asChild>
                  <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(recordLabel + " A&R")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                    <Disc className="w-4 h-4" />
                    <span>Find Label A&R</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`https://www.instagram.com/${name.replace(/\s+/g, '').toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                  <Instagram className="w-4 h-4" />
                  <span>Instagram Profile</span>
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </a>
              </DropdownMenuItem>
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
          {publishingShare !== undefined && publishingShare > 0 ? (
            <Badge 
              variant="outline" 
              className="text-xs font-semibold bg-violet-500/20 text-violet-400 border-violet-500/30 flex items-center gap-1"
              title={`Publishing share: ${publishingShare}%${shareSource ? ` (via ${shareSource})` : ''}`}
            >
              <PieChart className="w-3 h-3" />
              {publishingShare}%
            </Badge>
          ) : role === "writer" ? (
            <Badge 
              variant="outline" 
              className="text-[10px] text-muted-foreground border-border/50 flex items-center gap-1 cursor-help"
              title="Publishing splits not available for this work"
            >
              <PieChart className="w-3 h-3" />
              –
            </Badge>
          ) : null}
          {source && sourceStyles[source] && (
            <Badge 
              variant="outline" 
              className={`text-[10px] ${sourceStyles[source].className}`}
            >
              {sourceStyles[source].label}
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
        {/* Publishing status chip */}
        <Badge 
          variant={publisher ? "publisher" : "publisher-unknown"} 
          className="text-xs flex items-center gap-1"
          title={publisher || "Publisher unknown"}
        >
          <Building2 className="w-3 h-3" />
          {publisher ? (
            <span>
              <span className="font-semibold text-[10px] mr-1">Pub: Signed</span>
              <span className="max-w-[120px] sm:max-w-[180px] truncate inline-block align-bottom" title={publisher}>{publisher}</span>
            </span>
          ) : pro ? (
            <span className="text-[10px]">Pub: Unknown <span className="opacity-70 italic">({pro})</span></span>
          ) : (
            <span className="text-[10px]">Pub: Unsigned</span>
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
              <span>
                <span className="font-semibold text-[10px] mr-1">Label: Signed</span>
                <span className="max-w-[120px] sm:max-w-[180px] truncate inline-block align-bottom" title={recordLabel}>{recordLabel}</span>
              </span>
            ) : (
              <span className="text-[10px]">Label: Unsigned</span>
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
        {/* Copy individual credit */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-primary w-8 h-8"
              onClick={() => {
                const parts = [`${name} — ${roleLabels[role]}`];
                if (pro) parts.push(`PRO: ${pro}`);
                if (publisher) parts.push(`Publisher: ${publisher}`);
                if (ipi) parts.push(`IPI: ${ipi}`);
                if (publishingShare) parts.push(`Share: ${publishingShare}%`);
                navigator.clipboard.writeText(parts.join(' | ')).then(() => {
                  toast({ title: "Copied!", description: `${name}'s info copied.` });
                }).catch(() => {});
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Copy credit info</TooltipContent>
        </Tooltip>
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
        {/* Add to Watchlist */}
        {songTitle && songArtist && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 ${isWatched ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                onClick={handleAddToWatchlist}
                disabled={isWatched}
              >
                {isWatched ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {isWatched ? "Already watching" : "Add to Watchlist"}
            </TooltipContent>
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
