import { useMemo, useState } from "react";
import { Loader2, Link2, Music, Youtube as YoutubeIcon, Apple as AppleIcon, Plus, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { classifyInputLine, type ParsedDspLink } from "@/lib/dsp-link-parser";
import {
  normalizeCredits,
  appleMarkdownToRaw,
  youtubeDescriptionToRaw,
  type CanonicalCredit,
  type RawCredit,
} from "@/lib/canonical-credits";

export interface DspImportSong {
  title?: string;
  artist?: string;
  isrc?: string;
  durationMs?: number;
  releaseDate?: string;
  spotifyStreams?: number;
  youtubeViews?: number;
  spotifyUrl?: string;
  appleUrl?: string;
  youtubeUrl?: string;
  canonicalCredits: CanonicalCredit[];
  dspSources: string[];
}

interface ApiResultRow {
  ok: boolean;
  item: ParsedDspLink;
  error?: string;
  song?: any;
  rawCredits?: RawCredit[];
  appleMarkdown?: string;
  youtubeDescription?: string;
}

interface DspLinkImporterProps {
  onImport: (songs: DspImportSong[]) => void;
  /** Compact = used inside another sheet (e.g. BatchUpload). */
  compact?: boolean;
}

const PROVIDER_ICON: Record<string, JSX.Element> = {
  spotify: <Music className="w-3 h-3" />,
  apple: <AppleIcon className="w-3 h-3" />,
  youtube: <YoutubeIcon className="w-3 h-3" />,
};

export function DspLinkImporter({ onImport, compact }: DspLinkImporterProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DspImportSong[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const parsed = useMemo(() => {
    const lines = input.split(/\r?\n/);
    const links: ParsedDspLink[] = [];
    const skipped: string[] = [];
    for (const line of lines) {
      const c = classifyInputLine(line);
      if (c.link) links.push(c.link);
      else if (c.text) skipped.push(c.text);
    }
    return { links: links.slice(0, 25), skipped };
  }, [input]);

  async function run() {
    if (parsed.links.length === 0) return;
    setBusy(true);
    setErrors([]);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("dsp-import", {
        body: { items: parsed.links.map((l) => ({ provider: l.provider, id: l.id, url: l.url })) },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Import failed");

      // Group multi-source rows by ISRC (or normalised title|artist) so the
      // same song imported from Spotify + YouTube becomes one entry with
      // merged credits.
      const buckets = new Map<string, { song: DspImportSong; raws: RawCredit[] }>();
      const rowErrors: string[] = [];

      for (const row of data.results as ApiResultRow[]) {
        if (!row.ok || !row.song) {
          rowErrors.push(`${row.item.url} — ${row.error || "no data"}`);
          continue;
        }
        const key = (row.song.isrc?.toUpperCase())
          || `${(row.song.title || "").toLowerCase().trim()}|${(row.song.artist || "").toLowerCase().trim()}`;

        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            song: {
              title: row.song.title,
              artist: row.song.artist,
              isrc: row.song.isrc,
              durationMs: row.song.durationMs,
              releaseDate: row.song.releaseDate,
              youtubeViews: row.song.youtubeViews,
              spotifyUrl: row.song.spotifyUrl,
              appleUrl: row.song.appleUrl,
              youtubeUrl: row.song.youtubeUrl,
              canonicalCredits: [],
              dspSources: [],
            },
            raws: [],
          };
          buckets.set(key, bucket);
        }

        // Merge song fields (prefer non-empty, prefer Spotify-provided fields).
        bucket.song.title ||= row.song.title;
        bucket.song.artist ||= row.song.artist;
        bucket.song.isrc ||= row.song.isrc;
        bucket.song.durationMs ||= row.song.durationMs;
        bucket.song.releaseDate ||= row.song.releaseDate;
        bucket.song.youtubeViews ||= row.song.youtubeViews;
        bucket.song.spotifyUrl ||= row.song.spotifyUrl;
        bucket.song.appleUrl ||= row.song.appleUrl;
        bucket.song.youtubeUrl ||= row.song.youtubeUrl;
        if (!bucket.song.dspSources.includes(row.item.provider)) bucket.song.dspSources.push(row.item.provider);

        // Collect raw credits from each source
        if (row.rawCredits?.length) bucket.raws.push(...row.rawCredits);
        if (row.appleMarkdown) bucket.raws.push(...appleMarkdownToRaw(row.appleMarkdown));
        if (row.youtubeDescription) bucket.raws.push(...youtubeDescriptionToRaw(row.youtubeDescription));
      }

      const songs: DspImportSong[] = [];
      for (const { song, raws } of buckets.values()) {
        song.canonicalCredits = normalizeCredits(raws);
        songs.push(song);
      }

      setResults(songs);
      setErrors(rowErrors);
      if (songs.length === 0 && rowErrors.length > 0) {
        toast({ title: "Import failed", description: rowErrors[0], variant: "destructive" });
      } else {
        toast({
          title: `Resolved ${songs.length} song${songs.length === 1 ? "" : "s"}`,
          description: rowErrors.length ? `${rowErrors.length} link(s) failed.` : undefined,
        });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    if (!results.length) return;
    onImport(results);
    setInput("");
    setResults([]);
    setErrors([]);
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4 rounded-xl border border-border bg-card p-4"}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Import from DSP links</h3>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Paste Spotify, Apple Music, or YouTube track URLs (one per line, up to 25). The same song from multiple
        sources is merged into one entry with a unified writer/producer list.
      </p>
      <Textarea
        placeholder={"https://open.spotify.com/track/...\nhttps://music.apple.com/.../song?i=...\nhttps://youtu.be/..."}
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {parsed.links.length} link{parsed.links.length === 1 ? "" : "s"} detected
          {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} non-link line(s) skipped`}
        </div>
        <Button size="sm" onClick={run} disabled={busy || parsed.links.length === 0}>
          {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
          Resolve {parsed.links.length || ""}
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-destructive mb-1">
            <AlertCircle className="w-3 h-3" /> {errors.length} link(s) failed
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-destructive/80">
            {errors.slice(0, 5).map((e, i) => <li key={i} className="truncate">{e}</li>)}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Resolved songs</div>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="w-3 h-3 mr-1" /> Add {results.length} to catalog
            </Button>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {results.map((s, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{s.title || "Unknown title"}</div>
                    <div className="text-muted-foreground truncate">
                      {s.artist || "Unknown artist"}
                      {s.isrc ? ` · ISRC ${s.isrc}` : ""}
                      {s.releaseDate ? ` · ${s.releaseDate}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {s.dspSources.map((src) => (
                      <Badge key={src} variant="outline" className="h-5 px-1.5 gap-1 text-[10px]">
                        {PROVIDER_ICON[src]} {src}
                      </Badge>
                    ))}
                  </div>
                </div>
                {s.canonicalCredits.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.canonicalCredits.slice(0, 12).map((c, j) => (
                      <Badge key={j} variant="secondary" className="h-5 px-1.5 gap-1 text-[10px]" title={`${c.role}${c.alsoRoles.length ? ` (also: ${c.alsoRoles.join(", ")})` : ""} · ${c.confidence}% conf · ${c.sources.join(", ")}`}>
                        {c.role === "writer" ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : null}
                        {c.name}
                        <span className="opacity-60">· {c.role}</span>
                      </Badge>
                    ))}
                    {s.canonicalCredits.length > 12 && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">+{s.canonicalCredits.length - 12}</Badge>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">No credits available — try adding more DSP sources.</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
