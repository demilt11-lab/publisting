import { useState, useRef, useCallback } from "react";
import { FileSpreadsheet, Upload, X, Loader2, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { lookupSong } from "@/lib/api/songLookup";
import { useToast } from "@/hooks/use-toast";

interface CsvRow {
  artist: string;
  title?: string;
  isrc?: string;
  spotifyUrl?: string;
}

interface ImportResult extends CsvRow {
  status: "pending" | "loading" | "done" | "error";
  signed?: number;
  unsigned?: number;
  topPublisher?: string;
  error?: string;
}

interface CsvBulkImportProps {
  selectedRegions: string[];
  onSongClick?: (query: string) => void;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current || row.length > 0) { row.push(current.trim()); rows.push(row); }
      row = [];
      current = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current || row.length > 0) { row.push(current.trim()); rows.push(row); }
  return rows;
}

function detectColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  for (let i = 0; i < lower.length; i++) {
    if (lower[i].includes("artist") || lower[i] === "performer") map.artist = i;
    else if (lower[i].includes("title") || lower[i].includes("song") || lower[i].includes("track")) map.title = i;
    else if (lower[i].includes("isrc")) map.isrc = i;
    else if (lower[i].includes("spotify") || lower[i].includes("url") || lower[i].includes("link")) map.spotifyUrl = i;
  }
  return map;
}

export function CsvBulkImport({ selectedRegions, onSongClick }: CsvBulkImportProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [columnMap, setColumnMap] = useState<Record<string, number>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [step, setStep] = useState<"upload" | "map" | "process">("upload");
  const cancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        toast({ title: "Invalid CSV", description: "File must have headers and at least one data row.", variant: "destructive" });
        return;
      }
      const h = parsed[0];
      setHeaders(h);
      setRawRows(parsed.slice(1).filter(r => r.some(c => c.length > 0)));
      setColumnMap(detectColumns(h));
      setStep("map");
    };
    reader.readAsText(file);
  }, [toast]);

  const handleProcess = useCallback(async () => {
    if (!columnMap.artist && !columnMap.title && !columnMap.isrc && !columnMap.spotifyUrl) {
      toast({ title: "Map at least one column", variant: "destructive" });
      return;
    }

    const rows: CsvRow[] = rawRows.map(r => ({
      artist: r[columnMap.artist] || "",
      title: r[columnMap.title] || undefined,
      isrc: r[columnMap.isrc] || undefined,
      spotifyUrl: r[columnMap.spotifyUrl] || undefined,
    })).filter(r => r.artist || r.title || r.isrc || r.spotifyUrl);

    if (rows.length === 0) { toast({ title: "No valid rows found", variant: "destructive" }); return; }
    if (rows.length > 100) {
      toast({ title: "Too many rows", description: "Maximum 100 rows per import.", variant: "destructive" });
      return;
    }

    const initial: ImportResult[] = rows.map(r => ({ ...r, status: "pending" }));
    setResults(initial);
    setStep("process");
    setIsProcessing(true);
    setProcessedCount(0);
    cancelledRef.current = false;

    for (let i = 0; i < rows.length; i++) {
      if (cancelledRef.current) break;
      const row = rows[i];
      setResults(prev => prev.map((r, j) => j === i ? { ...r, status: "loading" } : r));

      try {
        const query = row.spotifyUrl || row.isrc || `${row.artist} - ${row.title || ""}`.trim();
        const result = await lookupSong(query, [], false);

        if (result.success && result.data) {
          const credits = result.data.credits || [];
          const signed = credits.filter(c => c.publishingStatus === "signed").length;
          const unsigned = credits.filter(c => c.publishingStatus === "unsigned").length;
          const publishers = credits.filter(c => c.publisher).map(c => c.publisher!);
          setResults(prev => prev.map((r, j) => j === i ? {
            ...r, status: "done", signed, unsigned,
            topPublisher: publishers[0] || "—",
          } : r));
        } else {
          setResults(prev => prev.map((r, j) => j === i ? { ...r, status: "error", error: result.error || "Not found" } : r));
        }
      } catch {
        setResults(prev => prev.map((r, j) => j === i ? { ...r, status: "error", error: "Lookup failed" } : r));
      }

      setProcessedCount(i + 1);
      if (i < rows.length - 1) await new Promise(r => setTimeout(r, 1200));
    }

    setIsProcessing(false);
  }, [rawRows, columnMap, toast]);

  const exportResults = useCallback(() => {
    const header = "Artist,Title,ISRC,Status,Signed,Unsigned,Top Publisher\n";
    const body = results.map(r =>
      `"${r.artist}","${r.title || ""}","${r.isrc || ""}","${r.status}",${r.signed ?? ""},${r.unsigned ?? ""},"${r.topPublisher || ""}"`
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `publisting-bulk-import-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const doneCount = results.filter(r => r.status === "done").length;
  const errorCount = results.filter(r => r.status === "error").length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          CSV Import
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Bulk CSV Import
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {step === "upload" && (
            <div className="space-y-3">
              <div
                className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to upload CSV file</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Max 100 rows · Columns: Artist, Title, ISRC, Spotify URL</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileSelect} />

              <div className="p-3 rounded-lg bg-muted/10 border border-border/30">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Expected CSV format:</p>
                <code className="text-[9px] text-muted-foreground block">
                  Artist,Title,ISRC,Spotify URL{"\n"}
                  Drake,God's Plan,USUG11800200,{"\n"}
                  Billie Eilish,Bad Guy,,https://open.spotify.com/track/...
                </code>
              </div>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Found <span className="text-foreground font-medium">{rawRows.length}</span> rows.
                Map your columns:
              </p>

              {(["artist", "title", "isrc", "spotifyUrl"] as const).map(field => (
                <div key={field} className="flex items-center gap-2">
                  <Label className="text-xs w-20 capitalize">{field === "spotifyUrl" ? "Spotify URL" : field}</Label>
                  <Select
                    value={columnMap[field]?.toString() ?? "none"}
                    onValueChange={v => setColumnMap(prev => v === "none" ? { ...prev } : { ...prev, [field]: parseInt(v) })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Skip —</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={i.toString()}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("upload")} className="text-xs">Back</Button>
                <Button size="sm" onClick={handleProcess} className="text-xs">
                  Process {rawRows.length} rows
                </Button>
              </div>
            </div>
          )}

          {step === "process" && (
            <div className="space-y-3">
              {isProcessing && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Processing {processedCount}/{results.length}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { cancelledRef.current = true; }}>
                      <X className="w-3 h-3 mr-1" />Cancel
                    </Button>
                  </div>
                  <Progress value={(processedCount / results.length) * 100} className="h-1.5" />
                </div>
              )}

              {!isProcessing && results.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-0.5 text-emerald-400" />{doneCount} done
                  </Badge>
                  {errorCount > 0 && (
                    <Badge variant="outline" className="text-[10px] text-red-400">
                      <AlertCircle className="w-3 h-3 mr-0.5" />{errorCount} errors
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px] gap-1" onClick={exportResults}>
                    <Download className="w-3 h-3" />Export
                  </Button>
                </div>
              )}

              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-8">#</TableHead>
                      <TableHead className="text-[10px]">Artist</TableHead>
                      <TableHead className="text-[10px]">Title</TableHead>
                      <TableHead className="text-[10px] w-14">Status</TableHead>
                      <TableHead className="text-[10px] w-20">Publisher</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow
                        key={i}
                        className={r.status === "done" ? "cursor-pointer hover:bg-secondary/30" : ""}
                        onClick={() => r.status === "done" && onSongClick?.(`${r.artist} - ${r.title || ""}`)}
                      >
                        <TableCell className="text-[10px] text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-[10px] max-w-[100px] truncate">{r.artist}</TableCell>
                        <TableCell className="text-[10px] max-w-[100px] truncate">{r.title || "—"}</TableCell>
                        <TableCell>
                          {r.status === "loading" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                          {r.status === "done" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-emerald-400">
                              {r.signed}S/{r.unsigned}U
                            </Badge>
                          )}
                          {r.status === "error" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-red-400">Error</Badge>
                          )}
                          {r.status === "pending" && <span className="text-[10px] text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-[10px] max-w-[80px] truncate">{r.topPublisher || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
