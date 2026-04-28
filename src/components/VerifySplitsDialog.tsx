import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ascapAceUrl, bmiSongviewUrl, isValidSplit, sumShares,
  type VerifiedPublisher, type VerifiedSplitRecord, type VerifiedWriter, type SplitSource,
} from "@/lib/verifiedSplits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  song: { title: string; artist?: string };
  initial?: VerifiedSplitRecord | null;
  onSaved?: (rec: VerifiedSplitRecord) => void;
}

const emptyWriter = (): VerifiedWriter => ({ name: "", ipi: "", share: 0, pro: "" });
const emptyPublisher = (): VerifiedPublisher => ({ name: "", ipi: "", share: 0, pro: "" });

export function VerifySplitsDialog({ open, onOpenChange, song, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [source, setSource] = useState<SplitSource>(initial?.source ?? "manual");
  const [iswc, setIswc] = useState(initial?.iswc ?? "");
  const [workId, setWorkId] = useState(initial?.work_id ?? "");
  const [writers, setWriters] = useState<VerifiedWriter[]>(initial?.writers?.length ? initial.writers : [emptyWriter()]);
  const [publishers, setPublishers] = useState<VerifiedPublisher[]>(initial?.publishers?.length ? initial.publishers : [emptyPublisher()]);
  const [saving, setSaving] = useState(false);
  const [mlcLoading, setMlcLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSource(initial?.source ?? "manual");
      setIswc(initial?.iswc ?? "");
      setWorkId(initial?.work_id ?? "");
      setWriters(initial?.writers?.length ? initial.writers : [emptyWriter()]);
      setPublishers(initial?.publishers?.length ? initial.publishers : [emptyPublisher()]);
    }
  }, [open, initial]);

  const writerSum = useMemo(() => sumShares(writers), [writers]);
  const pubSum = useMemo(() => sumShares(publishers), [publishers]);

  const updateWriter = (i: number, patch: Partial<VerifiedWriter>) =>
    setWriters((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const updatePub = (i: number, patch: Partial<VerifiedPublisher>) =>
    setPublishers((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  async function tryMlcLookup() {
    setMlcLoading(true);
    try {
      const { data: search, error } = await supabase.functions.invoke("mlc-lookup", {
        body: { action: "search", title: song.title, artist: song.artist, iswc: iswc || undefined },
      });
      if (error) throw error;
      if ((search as any)?.error === "no_credentials") {
        toast({ title: "MLC credentials needed", description: "Add MLC API credentials in catalog settings.", variant: "destructive" });
        return;
      }
      const data = (search as any)?.data;
      const works = data?.works || data?.results || data;
      const first = Array.isArray(works) ? works[0] : null;
      const id = first?.mlcSongCode || first?.id;
      if (!id) {
        toast({ title: "No MLC match", description: "No work found. Try BMI/ASCAP or enter manually.", variant: "destructive" });
        return;
      }
      const { data: workResp } = await supabase.functions.invoke("mlc-lookup", {
        body: { action: "work", workId: id },
      });
      const work = (workResp as any)?.data;
      const newWriters: VerifiedWriter[] = (work?.writers || []).map((w: any) => ({
        name: w.name || w.fullName || "",
        ipi: w.ipi || w.ipiNameNumber || "",
        share: Number(w.share || w.mechanicalShare || 0),
        pro: (w.pro || w.proAffiliation || "") as any,
      }));
      const newPubs: VerifiedPublisher[] = (work?.publishers || []).map((p: any) => ({
        name: p.name || p.publisherName || "",
        ipi: p.ipi || p.ipiNameNumber || "",
        share: Number(p.share || p.mechanicalShare || 0),
        pro: (p.pro || p.proAffiliation || "") as any,
      }));
      if (newWriters.length || newPubs.length) {
        setWriters(newWriters.length ? newWriters : [emptyWriter()]);
        setPublishers(newPubs.length ? newPubs : [emptyPublisher()]);
        setSource("mlc");
        setWorkId(String(id));
        if (work?.iswc) setIswc(String(work.iswc));
        toast({ title: "MLC data loaded", description: `Loaded ${newWriters.length} writers / ${newPubs.length} publishers.` });
      } else {
        toast({ title: "Empty MLC work", description: "MLC returned no writer/publisher rows.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "MLC lookup failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setMlcLoading(false);
    }
  }

  async function handleSave() {
    const cleanedWriters = writers.filter((w) => w.name.trim());
    const cleanedPubs = publishers.filter((p) => p.name.trim());
    const record: VerifiedSplitRecord = {
      song_title: song.title, song_artist: song.artist || null,
      iswc: iswc || null, work_id: workId || null,
      source, writers: cleanedWriters, publishers: cleanedPubs,
    };
    const valid = isValidSplit(record);
    if (!valid.ok) {
      toast({ title: "Invalid splits", description: valid.reason, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign in required", variant: "destructive" });
        return;
      }
      // upsert by (user_id, song_title, song_artist) – delete existing then insert (no unique constraint to keep flexible)
      if (initial?.id) {
        const { error } = await supabase.from("verified_splits").update({
          source, iswc: record.iswc, work_id: record.work_id,
          writers: record.writers as any, publishers: record.publishers as any,
          last_verified: new Date().toISOString(),
        }).eq("id", initial.id);
        if (error) throw error;
        onSaved?.({ ...record, id: initial.id });
      } else {
        const { data, error } = await supabase.from("verified_splits").insert({
          user_id: user.id,
          song_title: record.song_title, song_artist: record.song_artist,
          iswc: record.iswc, work_id: record.work_id, source,
          writers: record.writers as any, publishers: record.publishers as any,
        }).select("id").single();
        if (error) throw error;
        onSaved?.({ ...record, id: data.id });
      }
      toast({ title: "Splits saved", description: `Source: ${source.toUpperCase()}` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Verify splits — {song.title}
          </DialogTitle>
          <DialogDescription>
            {song.artist ? `Artist: ${song.artist}. ` : ""}Pull from MLC, look up on BMI/ASCAP, or enter manually. Shares must total 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={tryMlcLookup} disabled={mlcLoading}>
            {mlcLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Try MLC API lookup
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild type="button" variant="outline">
              <a href={bmiSongviewUrl(song.title, song.artist)} target="_blank" rel="noreferrer">
                BMI Songview <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
            <Button asChild type="button" variant="outline">
              <a href={ascapAceUrl(song.title, song.artist)} target="_blank" rel="noreferrer">
                ASCAP ACE <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">ISWC</Label>
            <Input value={iswc} onChange={(e) => setIswc(e.target.value)} placeholder="T-123.456.789-0" />
          </div>
          <div>
            <Label className="text-xs">MLC Work ID</Label>
            <Input value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="MLC song code" />
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <select value={source} onChange={(e) => setSource(e.target.value as SplitSource)}
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
              <option value="manual">Manual entry</option>
              <option value="mlc">Verified via MLC</option>
              <option value="bmi">Verified via BMI</option>
              <option value="ascap">Verified via ASCAP</option>
            </select>
          </div>
        </div>

        {/* Writers */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Writers</h4>
            <span className={`text-xs ${Math.abs(writerSum - 100) > 0.5 && writers.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              Total: {writerSum.toFixed(1)}%
            </span>
          </div>
          {writers.map((w, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4"><Label className="text-xs">Name</Label>
                <Input value={w.name} onChange={(e) => updateWriter(i, { name: e.target.value })} /></div>
              <div className="col-span-3"><Label className="text-xs">IPI</Label>
                <Input value={w.ipi || ""} onChange={(e) => updateWriter(i, { ipi: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">PRO</Label>
                <Input value={w.pro || ""} onChange={(e) => updateWriter(i, { pro: e.target.value as any })} placeholder="ASCAP" /></div>
              <div className="col-span-2"><Label className="text-xs">Share %</Label>
                <Input type="number" inputMode="decimal" value={w.share}
                  onChange={(e) => updateWriter(i, { share: parseFloat(e.target.value) || 0 })} /></div>
              <div className="col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => setWriters((r) => r.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setWriters((r) => [...r, emptyWriter()])}>
            <Plus className="w-3 h-3 mr-1" /> Add writer
          </Button>
        </section>

        {/* Publishers */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Publishers</h4>
            <span className={`text-xs ${Math.abs(pubSum - 100) > 0.5 && publishers.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              Total: {pubSum.toFixed(1)}%
            </span>
          </div>
          {publishers.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4"><Label className="text-xs">Name</Label>
                <Input value={p.name} onChange={(e) => updatePub(i, { name: e.target.value })} /></div>
              <div className="col-span-3"><Label className="text-xs">IPI</Label>
                <Input value={p.ipi || ""} onChange={(e) => updatePub(i, { ipi: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">PRO</Label>
                <Input value={p.pro || ""} onChange={(e) => updatePub(i, { pro: e.target.value as any })} placeholder="ASCAP" /></div>
              <div className="col-span-2"><Label className="text-xs">Share %</Label>
                <Input type="number" inputMode="decimal" value={p.share}
                  onChange={(e) => updatePub(i, { share: parseFloat(e.target.value) || 0 })} /></div>
              <div className="col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => setPublishers((r) => r.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setPublishers((r) => [...r, emptyPublisher()])}>
            <Plus className="w-3 h-3 mr-1" /> Add publisher
          </Button>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save verified splits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}