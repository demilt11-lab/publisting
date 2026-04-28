import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, AlertTriangle, Trash2, ScanSearch, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  PRO_PORTALS,
  parsePaste,
  diffAgainstBaseline,
  type PROSource,
  type ParsedPasteBlock,
  type Discrepancy,
} from "@/lib/proPasteParser";
import type { VerifiedSplitRecord } from "@/lib/verifiedSplits";

interface SavedPaste {
  id: string;
  song_title: string;
  song_artist: string | null;
  source: string;
  raw_paste: string;
  parsed_json: any;
  discrepancies: any;
  created_at: string;
}

interface Props {
  /** Optional song hint (e.g. selected catalog song) used to pre-fill title/artist. */
  songHint?: { title?: string; artist?: string };
  /** All verified splits available for this user (used as the comparison baseline). */
  baselines?: VerifiedSplitRecord[];
}

export function ProCmoCrossReferencePanel({ songHint, baselines = [] }: Props) {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState(songHint?.title || "");
  const [songArtist, setSongArtist] = useState(songHint?.artist || "");
  const [source, setSource] = useState<PROSource>("unknown");
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [pastes, setPastes] = useState<SavedPaste[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadPastes();
  }, [userId]);

  useEffect(() => {
    if (songHint?.title && !songTitle) setSongTitle(songHint.title);
    if (songHint?.artist && !songArtist) setSongArtist(songHint.artist);
  }, [songHint?.title, songHint?.artist]);

  async function loadPastes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pro_manual_pastes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setPastes((data || []) as SavedPaste[]);
    } catch (e: any) {
      toast({ title: "Couldn't load pastes", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // Live parse preview
  const parsed: ParsedPasteBlock | null = useMemo(() => {
    if (!raw.trim()) return null;
    return parsePaste(raw);
  }, [raw]);

  // Find a matching baseline for the title/artist in the form
  const baseline: VerifiedSplitRecord | null = useMemo(() => {
    if (!songTitle.trim()) return null;
    const t = songTitle.trim().toLowerCase();
    const a = songArtist.trim().toLowerCase();
    return (
      baselines.find(
        (b) =>
          b.song_title.trim().toLowerCase() === t &&
          (a ? (b.song_artist || "").trim().toLowerCase() === a : true),
      ) || null
    );
  }, [songTitle, songArtist, baselines]);

  const discrepancies: Discrepancy[] = useMemo(
    () => (parsed ? diffAgainstBaseline(parsed, baseline) : []),
    [parsed, baseline],
  );

  // Auto-detect source as user types
  useEffect(() => {
    if (parsed && parsed.source !== "unknown" && source === "unknown") setSource(parsed.source);
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  function fillFromHint(s: PROSource, url: string) {
    setSource(s);
    const q = encodeURIComponent([songTitle, songArtist].filter(Boolean).join(" "));
    const sep = url.includes("?") ? "&" : "?";
    // Most portals accept a 'q' param; harmless if ignored
    window.open(q ? `${url}${sep}q=${q}` : url, "_blank", "noopener,noreferrer");
  }

  async function save() {
    if (!userId) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    if (!songTitle.trim()) { toast({ title: "Add a song title", variant: "destructive" }); return; }
    if (!raw.trim()) { toast({ title: "Paste some PRO data first", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const block = parsed ?? parsePaste(raw);
      const diffs = diffAgainstBaseline(block, baseline);
      const { error } = await supabase.from("pro_manual_pastes").insert({
        user_id: userId,
        song_title: songTitle.trim(),
        song_artist: songArtist.trim() || null,
        source: source === "unknown" ? block.source : source,
        raw_paste: raw,
        parsed_json: block as any,
        discrepancies: diffs as any,
      });
      if (error) throw error;
      toast({
        title: "Saved",
        description: diffs.length
          ? `${diffs.length} discrepancy${diffs.length === 1 ? "" : "ies"} flagged.`
          : baseline
            ? "Splits match the verified baseline."
            : "No verified baseline yet for this song.",
      });
      setRaw("");
      await loadPastes();
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const { error } = await supabase.from("pro_manual_pastes").delete().eq("id", id);
      if (error) throw error;
      setPastes((p) => p.filter((x) => x.id !== id));
    } catch (e: any) {
      toast({ title: "Delete failed", description: String(e?.message || e), variant: "destructive" });
    }
  }

  const writerRows = parsed?.rows.filter((r) => r.kind === "writer") ?? [];
  const publisherRows = parsed?.rows.filter((r) => r.kind === "publisher") ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            PRO/CMO Cross-Reference
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Open a public PRO/CMO portal, find the work, and paste the splits below. Publisting will parse the
            text and flag any discrepancies against your existing verified splits.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">Section 1 · Manual</Badge>
      </div>

      {/* Portal links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {PRO_PORTALS.map((p) => (
          <Button
            key={p.key}
            variant="outline"
            size="sm"
            className="justify-between"
            onClick={() => fillFromHint(p.key, p.url)}
            title={p.description}
          >
            <span className="truncate">{p.label}</span>
            <ExternalLink className="w-3 h-3 ml-2 shrink-0" />
          </Button>
        ))}
      </div>

      {/* Song identity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Song title</Label>
          <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="e.g. Bohemian Rhapsody" />
        </div>
        <div>
          <Label className="text-xs">Artist (optional)</Label>
          <Input value={songArtist} onChange={(e) => setSongArtist(e.target.value)} placeholder="e.g. Queen" />
        </div>
        <div>
          <Label className="text-xs">Source portal</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value as PROSource)}
          >
            <option value="unknown">Auto-detect</option>
            {PRO_PORTALS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Paste area */}
      <div>
        <Label className="text-xs">Paste PRO/CMO data</Label>
        <Textarea
          rows={8}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            "Paste the writers and publishers section from the portal here.\n\nExample:\nMercury, Freddie  IPI 00128393839  ASCAP  50%\nQueen Music Ltd (Publisher)  BMI  50%"
          }
          className="font-mono text-xs"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-muted-foreground">
            {parsed
              ? <>Parsed {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}{parsed.iswc ? ` · ISWC ${parsed.iswc}` : ""}</>
              : "Live parse appears here as you paste."}
          </div>
          <Button size="sm" onClick={save} disabled={saving || !raw.trim() || !songTitle.trim()}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ScanSearch className="w-3 h-3 mr-1" />}
            Parse & save
          </Button>
        </div>
      </div>

      {/* Live preview */}
      {parsed && parsed.rows.length > 0 && (
        <div className="rounded-md border border-border p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-semibold mb-1">Writers ({writerRows.length})</div>
            {writerRows.length === 0
              ? <div className="text-muted-foreground">None detected.</div>
              : (
                <ul className="space-y-1">
                  {writerRows.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {r.name}
                        {r.pro ? <Badge variant="outline" className="ml-1 text-[9px]">{r.pro}</Badge> : null}
                        {r.ipi ? <span className="text-muted-foreground ml-1">IPI {r.ipi}</span> : null}
                      </span>
                      <span className="text-foreground">{typeof r.share === "number" ? `${r.share}%` : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <div>
            <div className="font-semibold mb-1">Publishers ({publisherRows.length})</div>
            {publisherRows.length === 0
              ? <div className="text-muted-foreground">None detected.</div>
              : (
                <ul className="space-y-1">
                  {publisherRows.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {r.name}
                        {r.pro ? <Badge variant="outline" className="ml-1 text-[9px]">{r.pro}</Badge> : null}
                        {r.ipi ? <span className="text-muted-foreground ml-1">IPI {r.ipi}</span> : null}
                      </span>
                      <span className="text-foreground">{typeof r.share === "number" ? `${r.share}%` : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      )}

      {/* Discrepancy summary */}
      {parsed && (
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Comparison vs verified baseline</div>
            {!baseline ? (
              <Badge variant="outline" className="text-[10px]">No baseline for this song</Badge>
            ) : discrepancies.length === 0 ? (
              <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Matches baseline
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-1" /> {discrepancies.length} discrepancy{discrepancies.length === 1 ? "" : "ies"}
              </Badge>
            )}
          </div>
          {baseline && discrepancies.length > 0 && (
            <ul className="text-[11px] text-amber-400 list-disc list-inside space-y-1">
              {discrepancies.map((d, i) => (
                <li key={i}>
                  <span className="text-foreground">[{d.kind}] {d.name}</span>{" "}
                  {d.reason === "missing_in_baseline" && <>not present in verified splits (paste shows {d.pastedShare ?? "?"}%).</>}
                  {d.reason === "missing_in_paste" && <>missing from paste (verified shows {d.baselineShare ?? "?"}%).</>}
                  {d.reason === "share_mismatch" && <>share differs: verified {d.baselineShare}% vs paste {d.pastedShare}%.</>}
                  {d.reason === "pro_mismatch" && <>PRO differs: {d.detail}.</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Saved pastes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Saved cross-references</div>
          <Button variant="ghost" size="sm" onClick={loadPastes} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>
        {pastes.length === 0 ? (
          <div className="text-xs text-muted-foreground">No saved pastes yet.</div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {pastes.map((p) => {
              const diffs: Discrepancy[] = Array.isArray(p.discrepancies) ? p.discrepancies : [];
              return (
                <li key={p.id} className="p-2 flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {p.song_title} {p.song_artist ? <span className="text-muted-foreground">— {p.song_artist}</span> : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()} · {p.source}
                      {diffs.length > 0
                        ? <span className="ml-2 text-amber-400">{diffs.length} flagged</span>
                        : <span className="ml-2 text-primary">consensus</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(p.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}