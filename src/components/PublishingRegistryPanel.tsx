import { memo, useMemo } from "react";
import { ExternalLink, Search, Shield, Music, FileText, Radio, Loader2, Building2, Globe, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildAllProLinks } from "@/lib/api/sources/proLinksBuilder";
import { CollectingPublisher } from "@/lib/api/songLookup";
import { Skeleton } from "@/components/ui/skeleton";

interface PublishingRegistryPanelProps {
  songTitle: string;
  songArtist: string;
  isrc?: string;
  collectingPublishers?: CollectingPublisher[];
  detectedOrgs?: string[];
  isLoadingShares?: boolean;
}

interface RegistryLink {
  name: string;
  description: string;
  url: string;
  color: string;
  icon: typeof Search;
  priority: 'primary' | 'secondary';
}

export const PublishingRegistryPanel = memo(({
  songTitle,
  songArtist,
  isrc,
  collectingPublishers,
  detectedOrgs,
  isLoadingShares,
}: PublishingRegistryPanelProps) => {
  const links = useMemo(() => buildAllProLinks(songTitle, songArtist, isrc), [songTitle, songArtist, isrc]);

  const hasLiveData = (collectingPublishers && collectingPublishers.length > 0) || (detectedOrgs && detectedOrgs.length > 0);
  const verifiedAt = useMemo(() => hasLiveData ? new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null, [hasLiveData]);

  const registries: RegistryLink[] = useMemo(() => [
    // Primary — top lookup options
    {
      name: "SongView",
      description: "ASCAP + BMI + SESAC unified search — publishing rights, affiliations, shares & contact info",
      url: links.songViewUrl,
      color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/25",
      icon: Search,
      priority: 'primary',
    },
    {
      name: "SoundExchange ISRC",
      description: isrc ? `Look up ISRC ${isrc} — sound recording rights, performers & labels` : "Search sound recording rights, performers & labels",
      url: links.soundExchangeIsrcUrl,
      color: "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25",
      icon: Radio,
      priority: 'primary',
    },
    {
      name: "The MLC (Works)",
      description: "Mechanical licensing — publishing percentages, collecting entities & administrators",
      url: links.mlcWorksUrl,
      color: "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25",
      icon: FileText,
      priority: 'primary',
    },
    // Secondary — individual PRO databases
    {
      name: "ASCAP ACE",
      description: "Writer & publisher registration lookup",
      url: links.ascapSearchUrl,
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25",
      icon: Music,
      priority: 'secondary',
    },
    {
      name: "BMI Repertoire",
      description: "BMI songwriter & publisher records",
      url: links.bmiSearchUrl,
      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
      icon: Music,
      priority: 'secondary',
    },
    {
      name: "SESAC",
      description: "SESAC repertory search",
      url: links.sesacUrl,
      color: "bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25",
      icon: Music,
      priority: 'secondary',
    },
    {
      name: "GMR",
      description: "Global Music Rights catalog",
      url: links.gmrUrl,
      color: "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25",
      icon: Music,
      priority: 'secondary',
    },
  ], [links, isrc]);

  const primary = registries.filter(r => r.priority === 'primary');
  const secondary = registries.filter(r => r.priority === 'secondary');

  return (
    <div className="glass rounded-xl p-4 space-y-4 animate-fade-up">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Publishing Rights Lookup</h3>
        {hasLiveData ? (
          <Badge variant="outline" className="text-[9px] ml-auto bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
            Live data loaded
          </Badge>
        ) : isLoadingShares ? (
          <Badge variant="outline" className="text-[9px] ml-auto bg-primary/10 text-primary border-primary/30">
            <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
            Searching registries…
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] ml-auto">
            Search registries for "{songTitle}"
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Search these databases to verify publishing affiliations, ownership percentages, collecting publishers, and contact information.
      </p>

      {/* Live inline registry data — auto-populated from MLC/HFA/SoundExchange/PRO scrapers */}
      {(isLoadingShares || hasLiveData) && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Live Registry Results</span>
            {verifiedAt && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                Last verified {verifiedAt}
              </span>
            )}
          </div>

          {isLoadingShares && !hasLiveData && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Querying MLC, HFA, SoundExchange, ASCAP, BMI, SESAC, GMR, SongView in parallel…</span>
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          )}

          {collectingPublishers && collectingPublishers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Publishers / Administrators ({collectingPublishers.length})
              </p>
              <div className="space-y-1">
                {collectingPublishers.map((pub, i) => (
                  <div key={`${pub.name}-${i}`} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background/40 border border-border/30">
                    <Building2 className="w-3 h-3 text-primary flex-shrink-0" />
                    <span className="text-foreground font-medium truncate">{pub.name}</span>
                    {pub.role && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                        {pub.role === 'administrator' ? 'Admin' : pub.role === 'sub-publisher' ? 'Sub-Pub' : 'Publisher'}
                      </Badge>
                    )}
                    {pub.share != null && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-violet-500/15 text-violet-400 border-violet-500/25 ml-auto">
                        {pub.share}%
                      </Badge>
                    )}
                    <span className="text-[9px] text-muted-foreground ml-auto">{pub.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detectedOrgs && detectedOrgs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Rights Organizations Referenced
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedOrgs.map((org) => (
                  <Badge key={org} variant="outline" className="text-[10px] bg-accent/50">
                    {org}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-[9px] text-muted-foreground italic">
            Aggregated from public PRO and registry searches. Results cached 7 days.
          </p>
        </div>
      )}

      {/* Primary registries — large cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {primary.map((reg) => (
          <a
            key={reg.name}
            href={reg.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex flex-col gap-2 p-3 rounded-lg border transition-all ${reg.color}`}
          >
            <div className="flex items-center gap-2">
              <reg.icon className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold">{reg.name}</span>
              <ExternalLink className="w-3 h-3 ml-auto opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[10px] leading-relaxed opacity-80">{reg.description}</p>
          </a>
        ))}
      </div>

      {/* Secondary — compact row */}
      <div className="pt-2 border-t border-border/30">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Individual PRO Databases</p>
        <div className="flex flex-wrap gap-2">
          {secondary.map((reg) => (
            <a
              key={reg.name}
              href={reg.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
              <span className="text-foreground">{reg.name}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
});

PublishingRegistryPanel.displayName = "PublishingRegistryPanel";
