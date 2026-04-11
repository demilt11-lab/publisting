import { memo, useMemo } from "react";
import { ExternalLink, Search, Shield, Music, FileText, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildAllProLinks } from "@/lib/api/sources/proLinksBuilder";

interface PublishingRegistryPanelProps {
  songTitle: string;
  songArtist: string;
  isrc?: string;
}

interface RegistryLink {
  name: string;
  description: string;
  url: string;
  color: string;
  icon: typeof Search;
  priority: 'primary' | 'secondary';
}

export const PublishingRegistryPanel = memo(({ songTitle, songArtist, isrc }: PublishingRegistryPanelProps) => {
  const links = useMemo(() => buildAllProLinks(songTitle, songArtist, isrc), [songTitle, songArtist, isrc]);

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
        <Badge variant="outline" className="text-[9px] ml-auto">
          Search registries for "{songTitle}"
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Search these databases to verify publishing affiliations, ownership percentages, collecting publishers, and contact information.
      </p>

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
