import { memo, useEffect, useState } from "react";
import {
  Sparkles, Search, Loader2, CheckCircle2, AlertTriangle, ExternalLink,
  Music, Youtube, FileText, Shield, Building2, Clock, Zap, HelpCircle,
  Pin, History, BarChart3, ChevronDown, ChevronUp, X, GitCompare, ShoppingBag, Waves, Disc3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  runLookupIntelligence,
  LookupIntelligenceResult,
  ConfidenceBucket,
  fetchLookupSnapshots,
  pinManualOverride,
  clearManualOverride,
  LookupSnapshot,
} from "@/lib/api/lookupIntelligence";
import { LookupTrendChart } from "./LookupTrendChart";
import { CollaboratorTrackPanel } from "./CollaboratorTrackPanel";

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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<LookupSnapshot[]>([]);
  const [pinning, setPinning] = useState(false);

  const buildQuery = () => isrc || `${songTitle} ${songArtist}`.trim();

  const run = async () => {
    setLoading(true); setError(null);
    const r = await runLookupIntelligence(buildQuery());
    if (!r) setError("Lookup failed. One or more sources timed out.");
    setResult(r);
    setLoading(false);
  };

  useEffect(() => {
    if (songTitle && songArtist) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songTitle, songArtist, isrc]);

  // Lazy-load history when opened
  useEffect(() => {
    if (!showHistory || !result?.best_match) return;
    const key = `${(result.best_match.title || "").toLowerCase()}::${(result.best_match.artist || "").toLowerCase()}`
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 :]/g, " ").replace(/\s+/g, " ").trim();
    fetchLookupSnapshots(key, 25).then(setHistory);
  }, [showHistory, result?.best_match]);

  const onPin = async () => {
    if (!result) return;
    setPinning(true);
    const ok = await pinManualOverride(buildQuery(), result, "Pinned from Lookup tab");
    setPinning(false);
    toast({ title: ok ? "Match pinned" : "Pin failed", description: ok ? "This match will be returned for the same query." : "Sign in required.", variant: ok ? undefined : "destructive" });
  };

  const onUnpin = async () => {
    setPinning(true);
    const ok = await clearManualOverride(buildQuery());
    setPinning(false);
    toast({ title: ok ? "Pin removed" : "Unpin failed" });
    if (ok) run();
  };

  const bm = result?.best_match;
  const bucket = result?.confidence_bucket ?? "low";
  const cfg = bucketConfig[bucket];
  const alternates = (result?.candidates || []).filter((c) => !c.primary);
  const trackKey = bm
    ? `${(bm.title || "").toLowerCase()}::${(bm.artist || "").toLowerCase()}`
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 :]/g, " ").replace(/\s+/g, " ").trim()
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Lookup Intelligence
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-source canonical match · YouTube · Genius · MusicBrainz · Registry · Snapshot history
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {result?.override?.pinned ? (
            <Button variant="outline" size="sm" onClick={onUnpin} disabled={pinning} className="gap-2 border-emerald-500/30 text-emerald-400">
              <X className="w-3.5 h-3.5" /> Unpin override
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onPin} disabled={pinning || !result} className="gap-2">
              <Pin className="w-3.5 h-3.5" /> Pin best match
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={run} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Re-run
          </Button>
        </div>
      </div>

      {result?.override?.pinned && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
          <Pin className="w-3 h-3" />
          Manual override active — this match was pinned for the query.
        </div>
      )}

      {result?.ambiguous && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" />
          Top candidates are within 6% of each other — review alternates below.
        </div>
      )}

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

          {/* Score breakdown */}
          {result?.breakdown && (
            <div className="rounded-lg bg-muted/10 border border-border/30">
              <button
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full flex items-center justify-between p-2.5 text-xs font-medium text-foreground hover:bg-muted/20 rounded-lg"
              >
                <span className="flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Score breakdown</span>
                {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showBreakdown && (
                <div className="p-3 pt-0 grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(result.breakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 rounded bg-background/40 border border-border/30 px-2 py-1">
                      <span className="text-muted-foreground">{k}</span>
                      <span className={`tabular-nums ${(v as number) < 0 ? "text-rose-400" : "text-foreground"}`}>
                        {(v as number).toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
            <PlatformPill label="Tidal"   url={bm.platforms.tidal?.url ?? null} meta={bm.platforms.tidal?.trackId ? `id ${bm.platforms.tidal.trackId}` : null} icon={Waves} />
            <PlatformPill label="Deezer"  url={bm.platforms.deezer?.url ?? null} meta={bm.platforms.deezer?.rank ? `rank ${bm.platforms.deezer.rank}` : null} icon={Disc3} />
            <PlatformPill label="Amazon"  url={bm.platforms.amazonMusic?.url ?? null} meta={bm.platforms.amazonMusic?.trackId ? `id ${bm.platforms.amazonMusic.trackId}` : null} icon={ShoppingBag} />
          </div>
        </div>
      )}

      {/* Source conflicts */}
      {result?.conflicts && result.conflicts.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-amber-400" />
            Source Conflicts
            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
              {result.conflicts.length}
            </Badge>
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Sources disagree on these fields. Review before trusting downstream data.
          </p>
          <div className="space-y-2">
            {result.conflicts.map((c, i) => {
              const sevCls = c.severity === "high"
                ? "border-rose-500/30 bg-rose-500/5"
                : c.severity === "warn"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/30 bg-muted/10";
              return (
                <div key={i} className={`rounded-lg border ${sevCls} p-2.5 space-y-1.5`}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground uppercase tracking-wider text-[10px]">{c.field}</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">{c.severity}</Badge>
                    {c.note && <span className="text-[10px] text-muted-foreground truncate">{c.note}</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {c.values.map((v, j) => (
                      <div key={j} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded bg-background/40 border border-border/30">
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">{v.source}</Badge>
                        <span className="text-foreground truncate">{String(v.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
      {alternates.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Alternate Candidates</h4>
          {alternates.map((c, i) => {
            const alt = bucketConfig[c.bucket];
            return (
              <div key={i} className="rounded bg-background/40 border border-border/30 p-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium truncate flex-1">{c.title} — {c.artist}</span>
                  <Badge variant="outline" className="text-[9px]">{c.source}</Badge>
                  <Badge variant="outline" className={`text-[9px] ${alt.cls}`}>{alt.label}</Badge>
                  <span className="text-[9px] text-muted-foreground tabular-nums">{Math.round(c.score * 100)}%</span>
                </div>
                {c.reasons && c.reasons.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">{c.reasons.slice(0, 3).join(" · ")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Snapshot history */}
      {bm && (
        <div className="glass rounded-xl p-4 space-y-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-foreground"
          >
            <span className="flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Snapshot History</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showHistory && (
            history.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No prior snapshots yet.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="grid grid-cols-6 gap-2 text-[11px] py-1.5 px-2 rounded bg-background/40 border border-border/30 items-center">
                    <span className="text-muted-foreground col-span-2 truncate">
                      {new Date(h.captured_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="tabular-nums text-foreground">pop {h.spotify_popularity ?? "—"}</span>
                    <span className="tabular-nums text-foreground">YT {h.youtube_view_count?.toLocaleString() ?? "—"}</span>
                    <span className="tabular-nums text-foreground">G {h.genius_pageviews?.toLocaleString() ?? "—"}</span>
                    <span className="tabular-nums text-muted-foreground text-right">conf {(h.confidence_score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Trend chart (recharts on lookup_snapshots) */}
      {trackKey && <LookupTrendChart trackKey={trackKey} title={bm?.title} />}

      {/* Collaborator graph (per-track) */}
      {bm && (
        <CollaboratorTrackPanel
          writers={bm.publishing.writers || []}
          producers={bm.publishing.producers || []}
          publishers={(bm.publishing.collectingPublishers || []).map((p) => p.name)}
        />
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