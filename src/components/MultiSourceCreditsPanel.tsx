import { memo, useMemo } from "react";
import { ExternalLink, CheckCircle2, AlertCircle, XCircle, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { MultiSourceResult, SourceStatus, CreditedPerson } from "@/lib/types/multiSource";
import { cn } from "@/lib/utils";

interface MultiSourceCreditsPanelProps {
  data: MultiSourceResult;
  isLoading?: boolean;
}

const PRO_COLORS: Record<string, string> = {
  ASCAP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  BMI: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SESAC: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  GMR: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  SOCAN: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  artist: '🎤 Artist',
  writer: '✍️ Writer',
  songwriter: '✍️ Songwriter',
  producer: '🎛️ Producer',
  composer: '🎼 Composer',
  lyricist: '📝 Lyricist',
  arranger: '🎻 Arranger',
  mixer: '🔊 Mixer',
  engineer: '🔧 Engineer',
  featuring: '🎤 Feat.',
};

function SourceBadge({ source }: { source: SourceStatus }) {
  const isLink = source.recordsFetched === 0 && source.url;
  const statusIcon = source.status === 'success'
    ? <CheckCircle2 className="w-3 h-3 text-success" />
    : source.status === 'partial'
      ? <AlertCircle className="w-3 h-3 text-warning" />
      : source.status === 'failed'
        ? <XCircle className="w-3 h-3 text-destructive" />
        : <AlertCircle className="w-3 h-3 text-muted-foreground" />;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-2 py-0.5 gap-1 cursor-default",
        source.status === 'success' ? "border-success/30 text-success" :
        source.status === 'partial' ? "border-warning/30 text-warning" :
        source.status === 'failed' ? "border-destructive/30 text-destructive" :
        "border-border text-muted-foreground"
      )}
    >
      {statusIcon}
      {source.name}
      {isLink && <Link2 className="w-2.5 h-2.5" />}
    </Badge>
  );

  if (source.url) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="no-underline">
        {badge}
      </a>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="text-xs">
          {source.status === 'failed' ? 'Source unavailable' :
           source.status === 'no_data' ? 'No data found' :
           `${source.recordsFetched} record(s) fetched`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 0.8 ? 'bg-success' : value >= 0.5 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

function CreditRow({ person }: { person: CreditedPerson }) {
  const proClass = person.pro ? PRO_COLORS[person.pro] || 'bg-secondary text-secondary-foreground border-border' : '';

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-card border border-border/50 hover:border-border transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{person.name}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-secondary/50 text-muted-foreground border-border/60 shrink-0">
            {ROLE_LABELS[person.role] || person.role}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {person.pro && (
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", proClass)}>
              {person.pro}
            </Badge>
          )}
          {person.publishingCompany && (
            <Badge variant="outline" className={cn(
              "text-[9px] px-1.5 py-0",
              person.publishingType === 'major'
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-secondary/50 text-secondary-foreground border-border/60"
            )}>
              📄 {person.publishingCompany}
              {person.publishingType && person.publishingType !== 'unknown' && (
                <span className="ml-1 opacity-70">({person.publishingType})</span>
              )}
            </Badge>
          )}
          {person.recordLabel && (
            <Badge variant="outline" className={cn(
              "text-[9px] px-1.5 py-0",
              person.labelType === 'major'
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-secondary/50 text-secondary-foreground border-border/60"
            )}>
              🏷️ {person.recordLabel}
              {person.labelType && person.labelType !== 'unknown' && (
                <span className="ml-1 opacity-70">({person.labelType})</span>
              )}
            </Badge>
          )}
          {person.ipi && (
            <span className="text-[9px] text-muted-foreground font-mono">IPI: {person.ipi}</span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <ConfidenceMeter value={person.confidence} />
      </div>
    </div>
  );
}

export const MultiSourceCreditsPanel = memo(({ data, isLoading }: MultiSourceCreditsPanelProps) => {
  const apiSources = useMemo(() => data.sources.filter(s => s.recordsFetched > 0 || s.status !== 'success'), [data.sources]);
  const linkSources = useMemo(() => data.sources.filter(s => s.recordsFetched === 0 && s.url), [data.sources]);

  const groupedCredits = useMemo(() => {
    const groups: Record<string, CreditedPerson[]> = {};
    for (const c of data.credits) {
      const group = ['writer', 'songwriter', 'composer', 'lyricist'].includes(c.role) ? 'Writers & Composers'
        : ['producer', 'mixer', 'engineer', 'arranger'].includes(c.role) ? 'Production & Engineering'
        : 'Artists & Featured';
      (groups[group] ??= []).push(c);
    }
    return groups;
  }, [data.credits]);

  const confColor = data.overallConfidence >= 75 ? 'text-success' : data.overallConfidence >= 45 ? 'text-warning' : 'text-destructive';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Full Credits & Rights Intelligence</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Multi-source aggregated data with confidence scoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Overall Confidence</span>
          <span className={cn("text-lg font-bold font-mono", confColor)}>{data.overallConfidence}%</span>
        </div>
      </div>

      {/* Sources Searched */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sources Searched</p>
        <div className="flex flex-wrap gap-1.5">
          {apiSources.map(s => <SourceBadge key={s.name} source={s} />)}
          {linkSources.map(s => <SourceBadge key={s.name} source={s} />)}
        </div>
      </div>

      {/* ISRC / ISWC */}
      {(data.isrc || data.iswc) && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground font-mono">
          {data.isrc && <span>ISRC: {data.isrc}</span>}
          {data.iswc && <span>ISWC: {data.iswc}</span>}
        </div>
      )}

      {/* Grouped Credits */}
      {Object.entries(groupedCredits).map(([group, credits]) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold text-foreground">{group} ({credits.length})</p>
          <div className="space-y-1.5">
            {credits.map((c, i) => <CreditRow key={`${c.name}-${i}`} person={c} />)}
          </div>
        </div>
      ))}

      {data.credits.length === 0 && !isLoading && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No additional credits found from multi-source lookup.
        </div>
      )}

      {/* PRO Search Links */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Search PRO Databases Directly</p>
        <div className="flex flex-wrap gap-2">
          {data.ascapSearchUrl && (
            <a href={data.ascapSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> ASCAP ACE
            </a>
          )}
          {data.bmiSearchUrl && (
            <a href={data.bmiSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> BMI Repertoire
            </a>
          )}
          {data.mlcSearchUrl && (
            <a href={data.mlcSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> The MLC
            </a>
          )}
          {data.soundExchangeUrl && (
            <a href={data.soundExchangeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> SoundExchange
            </a>
          )}
          {data.sesacUrl && (
            <a href={data.sesacUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> SESAC
            </a>
          )}
          {data.gmrUrl && (
            <a href={data.gmrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> GMR
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

MultiSourceCreditsPanel.displayName = "MultiSourceCreditsPanel";
