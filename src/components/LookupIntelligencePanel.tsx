import { memo, useEffect, useState } from "react";
import {
  Sparkles, Search, Loader2, CheckCircle2, AlertTriangle, ExternalLink,
  Music, Youtube, FileText, Shield, Building2, Clock, Zap, HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  runLookupIntelligence,
  LookupIntelligenceResult,
  ConfidenceBucket,
} from "@/lib/api/lookupIntelligence";

interface Props {
  songTitle: string;
  songArtist: string;
  isrc?: string | null;
}

const bucketConfig: Record<ConfidenceBucket, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  exact:     { label: "Exact",        cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  strong:    { label: "Strong",       cls: "bg-teal-500/15 text-teal-400 border-teal-500/30",         icon: CheckCircle2 },
  probable:  { label: "Probable",     cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",         icon: Sparkles },
  ambiguous: { label: "Ambiguous",    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",     icon: AlertTriangle },
  low:       { label: "Low confidence",cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",       icon: AlertTriangle },
};

const sourceStatusCls: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  no_data: "bg-muted text-muted-foreground",
  failed:  "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

export const LookupIntelligencePanel = memo(({ songTitle, songArtist, isrc }: Props) => {
  const [result, setResult] = useState<LookupIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    const q = isrc || `${songTitle} ${songArtist}`.trim();
    const r = await runLookupIntelligence(q);
    if (!r) setError("Lookup failed. One or more sources timed out.");
    setResult(r);
    setLoading(false);
  };

  useEffect(() => {
    if (songTitle && songArtist) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songTitle, songArtist, isrc]);

  const bm = result?.best_match;
  const bucket = result?.confidence_bucket ?? "low";
  const cfg = bucketConfig[bucket];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Lookup Intelligence
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-source canonical match · YouTube · Genius · MusicBrainz · Registry
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Re-run
        </Button>
      </div>

      {loading && !result && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground rounded-lg border border-border/30 bg-muted/10">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Resolving canonical match across sources…</span>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Best match card */}
      {bm && (
        <div className="surface-elevated rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-4">
            {bm.coverUrl && (
              <img src={bm.coverUrl} alt="" className="w-16 h-16 rounded-md object-cover border border-border/40" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-base font-semibold text-foreground truncate">{bm.title}</h4>
                <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>
                  <cfg.icon className="w-2.5 h-2.5 mr-1" />
                  {cfg.label} · {Math.round((result!.confidence_score) * 100)}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{bm.artist}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {bm.isrc && <Badge variant="outline" className="text-[10px]">ISRC {bm.isrc}</Badge>}
                {bm.releaseYear && <Badge variant="outline" className="text-[10px]">{bm.releaseYear}</Badge>}
                {result?.last_verified_at && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(result.last_verified_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Why this match won */}
          {result && result.why_won.length > 0 && (
            <div className="rounded-lg bg-muted/20 border border-border/30 p-3 space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                Why this match won
              </p>
              <ul className="text-xs text-foreground space-y-0.5">
                {result.why_won.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Platform footprint */}
      {bm && (
        <div className="glass rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            Platform Footprint
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PlatformPill label="Spotify" url={bm.platforms.spotify.url} meta={bm.platforms.spotify.popularity != null ? `pop ${bm.platforms.spotify.popularity}` : null} icon={Music} />
            <PlatformPill label="YouTube" url={bm.platforms.youtube.url} meta={bm.platforms.youtube.views ? `${bm.platforms.youtube.views} views` : null} icon={Youtube} />
            <PlatformPill label="Genius"  url={bm.platforms.genius.url}  meta={bm.platforms.genius.pageviews ? `${bm.platforms.genius.pageviews.toLocaleString()} pv` : null} icon={FileText} />
            <PlatformPill label="Shazam"  url={bm.platforms.shazam.url}  meta={bm.platforms.shazam.count ? `${bm.platforms.shazam.count.toLocaleString()} tags` : null} icon={Sparkles} />
          </div>
        </div>
      )}

      {/* Publishing intelligence */}
      {bm && (bm.publishing.collectingPublishers.length > 0 || bm.publishing.detectedOrgs.length > 0 || bm.publishing.writers.length > 0) && (
        <div className="glass rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Publishing Intelligence
          </h4>

          {bm.publishing.collectingPublishers.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Publishers / Administrators</p>
              {bm.publishing.collectingPublishers.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background/40 border border-border/30">
                  <Building2 className="w-3 h-3 text-primary" />
                  <span className="text-foreground font-medium truncate">{p.name}</span>
                  {p.share != null && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-violet-500/15 text-violet-400 border-violet-500/25 ml-auto">
                      {p.share}%
                    </Badge>
                  )}
                  <span className="text-[9px] text-muted-foreground ml-auto">{p.source}</span>
                </div>
              ))}
            </div>
          )}

          {bm.publishing.writers.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Writers</p>
              <div className="flex flex-wrap gap-1.5">
                {bm.publishing.writers.slice(0, 12).map((w) => (
                  <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>
                ))}
              </div>
            </div>
          )}

          {bm.publishing.detectedOrgs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">PROs Referenced</p>
              <div className="flex flex-wrap gap-1.5">
                {bm.publishing.detectedOrgs.map((o) => (
                  <Badge key={o} variant="outline" className="text-[10px] bg-accent/50">{o}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source audit trail */}
      {result && (
        <div className="glass rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            Source Audit Trail
          </h4>
          <div className="space-y-1">
            {result.source_statuses.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background/40 border border-border/30">
                <span className="text-foreground flex-1 truncate">{s.name}</span>
                <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 ${sourceStatusCls[s.status] || ""}`}>
                  {s.status}
                </Badge>
                <span className="text-[9px] text-muted-foreground tabular-nums w-10 text-right">
                  {s.recordsFetched}
                </span>
              </div>
            ))}
          </div>
          {result.duration_ms != null && (
            <p className="text-[10px] text-muted-foreground italic">
              Completed in {result.duration_ms}ms · {result.agreement ?? 1} sources agreed
            </p>
          )}
        </div>
      )}

      {/* Alternates */}
      {result && result.candidates.length > 1 && (
        <div className="glass rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Alternate Candidates</h4>
          {result.candidates.filter((c) => !c.primary).map((c, i) => {
            const alt = bucketConfig[c.bucket];
            return (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-background/40 border border-border/30">
                <span className="text-foreground font-medium truncate flex-1">{c.title} — {c.artist}</span>
                <Badge variant="outline" className={`text-[9px] ${alt.cls}`}>{alt.label}</Badge>
                <span className="text-[9px] text-muted-foreground tabular-nums">{Math.round(c.score * 100)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

LookupIntelligencePanel.displayName = "LookupIntelligencePanel";

function PlatformPill({
  label, url, meta, icon: Icon,
}: { label: string; url: string | null; meta: string | null; icon: typeof Music }) {
  const present = !!url;
  return (
    <a
      href={url || "#"}
      target={url ? "_blank" : undefined}
      rel="noopener noreferrer"
      onClick={(e) => { if (!url) e.preventDefault(); }}
      className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${
        present ? "bg-primary/5 border-primary/20 hover:border-primary/40 text-foreground" : "bg-muted/20 border-border/30 text-muted-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{label}</div>
        {meta && <div className="text-[9px] opacity-70 truncate">{meta}</div>}
      </div>
      {present && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
    </a>
  );
}