import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { bmiSongviewUrl, ascapAceUrl, type VerifiedSplitRecord } from "@/lib/verifiedSplits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  song: { title: string; artist?: string } | null;
  /** Existing verified splits for this song (e.g. MLC source), used as the consensus baseline. */
  baseline: VerifiedSplitRecord | null;
}

interface SourceEntry {
  workId: string;
  writers: string;   // raw "Name 50%, Name 50%" pasted by user
  publishers: string;
}

/** Parse free-form "Name 50%, Other 50%" into [{name, share}]. */
function parseSplits(raw: string): { name: string; share: number }[] {
  if (!raw?.trim()) return [];
  return raw.split(/[\n,;]/).map((part) => {
    const m = part.trim().match(/^(.*?)[\s—–-]+([\d.]+)\s*%?\s*$/);
    if (m) return { name: m[1].trim(), share: parseFloat(m[2]) || 0 };
    return { name: part.trim(), share: 0 };
  }).filter((r) => r.name);
}

function sumShare(rows: { share: number }[]) {
  return rows.reduce((a, r) => a + (r.share || 0), 0);
}

/** Aggregate a writer/publisher list by normalized name. */
function agg(rows: { name: string; share: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.name.trim().toLowerCase();
    m.set(k, (m.get(k) || 0) + r.share);
  }
  return m;
}

function detectDiscrepancies(sources: { label: string; writers: Map<string, number>; publishers: Map<string, number> }[]) {
  const out: string[] = [];
  // Compare every pair on shared names
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const A = sources[i], B = sources[j];
      const allNames = new Set([...A.writers.keys(), ...B.writers.keys()]);
      for (const n of allNames) {
        const a = A.writers.get(n) ?? 0;
        const b = B.writers.get(n) ?? 0;
        if (Math.abs(a - b) > 0.5) {
          out.push(`Writer "${n}": ${A.label} ${a}% vs ${B.label} ${b}%`);
        }
      }
      const allPubs = new Set([...A.publishers.keys(), ...B.publishers.keys()]);
      for (const n of allPubs) {
        const a = A.publishers.get(n) ?? 0;
        const b = B.publishers.get(n) ?? 0;
        if (Math.abs(a - b) > 0.5) {
          out.push(`Publisher "${n}": ${A.label} ${a}% vs ${B.label} ${b}%`);
        }
      }
    }
  }
  return out;
}

export function CrossCheckDialog({ open, onOpenChange, song, baseline }: Props) {
  const { toast } = useToast();
  const [bmi, setBmi] = useState<SourceEntry>({ workId: "", writers: "", publishers: "" });
  const [ascap, setAscap] = useState<SourceEntry>({ workId: "", writers: "", publishers: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBmi({ workId: "", writers: "", publishers: "" });
    setAscap({ workId: "", writers: "", publishers: "" });
  }, [open, song?.title, song?.artist]);

  const bmiUrl = song ? bmiSongviewUrl(song.title, song.artist) : "#";
  const ascapUrl = song ? ascapAceUrl(song.title, song.artist) : "#";

  const compared = useMemo(() => {
    const sources: { label: string; writers: Map<string, number>; publishers: Map<string, number> }[] = [];
    if (baseline) {
      sources.push({
        label: baseline.source.toUpperCase(),
        writers: agg(baseline.writers.map((w) => ({ name: w.name, share: w.share }))),
        publishers: agg(baseline.publishers.map((p) => ({ name: p.name, share: p.share }))),
      });
    }
    const bmiW = parseSplits(bmi.writers); const bmiP = parseSplits(bmi.publishers);
    if (bmiW.length || bmiP.length) {
      sources.push({ label: "BMI", writers: agg(bmiW), publishers: agg(bmiP) });
    }
    const ascW = parseSplits(ascap.writers); const ascP = parseSplits(ascap.publishers);
    if (ascW.length || ascP.length) {
      sources.push({ label: "ASCAP", writers: agg(ascW), publishers: agg(ascP) });
    }
    return {
      sources,
      issues: detectDiscrepancies(sources),
      consensus: sources.length >= 2 && detectDiscrepancies(sources).length === 0,
    };
  }, [baseline, bmi, ascap]);

  async function save() {
    if (!song) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");

      const cross = {
        compared_at: new Date().toISOString(),
        sources: compared.sources.map((s) => ({
          label: s.label,
          writers: Array.from(s.writers, ([name, share]) => ({ name, share })),
          publishers: Array.from(s.publishers, ([name, share]) => ({ name, share })),
        })),
        issues: compared.issues,
        consensus: compared.consensus,
        bmi_raw: bmi,
        ascap_raw: ascap,
      };

      const { data: existing } = await supabase
        .from("verified_splits")
        .select("id")
        .eq("user_id", user.id)
        .eq("song_title", song.title)
        .eq("song_artist", song.artist || "")
        .maybeSingle();

      const patch: any = {
        cross_check_results: cross,
        bmi_work_id: bmi.workId || null,
        ascap_work_id: ascap.workId || null,
      };

      if (existing?.id) {
        await supabase.from("verified_splits").update(patch).eq("id", existing.id);
      } else {
        await supabase.from("verified_splits").insert({
          user_id: user.id,
          song_title: song.title,
          song_artist: song.artist || "",
          source: "manual",
          writers: [],
          publishers: [],
          ...patch,
        } as any);
      }

      toast({ title: "Cross-check saved" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Cross-check ownership
          </DialogTitle>
          <DialogDescription>
            Compare BMI Songview and ASCAP ACE against your existing verified splits. Open the repertoires, find the work, and paste the splits below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <a href={bmiUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="w-full justify-between">
              Open BMI Songview <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <a href={ascapUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="w-full justify-between">
              Open ASCAP ACE <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        </div>

        {/* Two paste blocks */}
        {(["bmi", "ascap"] as const).map((src) => {
          const value = src === "bmi" ? bmi : ascap;
          const setValue = src === "bmi" ? setBmi : setAscap;
          const label = src === "bmi" ? "BMI" : "ASCAP";
          const wTotal = sumShare(parseSplits(value.writers));
          const pTotal = sumShare(parseSplits(value.publishers));
          return (
            <div key={src} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{label}</div>
                <Input
                  className="h-7 w-48 text-xs"
                  placeholder="Work ID (optional)"
                  value={value.workId}
                  onChange={(e) => setValue({ ...value, workId: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Writers (Name 50%, Name 50%)</Label>
                  <Textarea rows={3} className="text-xs"
                    value={value.writers}
                    onChange={(e) => setValue({ ...value, writers: e.target.value })}
                    placeholder="Jane Doe 50%&#10;John Smith 50%" />
                  <div className={`text-[10px] mt-1 ${Math.abs(wTotal - 100) > 0.5 && wTotal > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                    Total: {wTotal.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Publishers</Label>
                  <Textarea rows={3} className="text-xs"
                    value={value.publishers}
                    onChange={(e) => setValue({ ...value, publishers: e.target.value })}
                    placeholder="Sony Music Pub 100%" />
                  <div className={`text-[10px] mt-1 ${Math.abs(pTotal - 100) > 0.5 && pTotal > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                    Total: {pTotal.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Side-by-side comparison */}
        {compared.sources.length > 0 && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Comparison</div>
              {compared.consensus ? (
                <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Consensus across {compared.sources.length} sources
                </Badge>
              ) : compared.issues.length > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  <AlertTriangle className="w-3 h-3 mr-1" /> {compared.issues.length} discrepancy{compared.issues.length === 1 ? "" : "ies"}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${compared.sources.length}, minmax(0,1fr))` }}>
              {compared.sources.map((s) => (
                <div key={s.label} className="text-[11px]">
                  <div className="font-semibold mb-1">{s.label}</div>
                  <div className="text-muted-foreground">Writers</div>
                  <ul>{Array.from(s.writers, ([n, v]) => <li key={n}>{n} — <span className="text-foreground">{v.toFixed(1)}%</span></li>)}</ul>
                  <div className="text-muted-foreground mt-1">Publishers</div>
                  <ul>{Array.from(s.publishers, ([n, v]) => <li key={n}>{n} — <span className="text-foreground">{v.toFixed(1)}%</span></li>)}</ul>
                </div>
              ))}
            </div>
            {compared.issues.length > 0 && (
              <ul className="text-[11px] text-amber-400 list-disc list-inside">
                {compared.issues.map((i, idx) => <li key={idx}>{i}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || compared.sources.length === 0}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save cross-check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}