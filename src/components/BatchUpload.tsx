import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, Download, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupSong } from "@/lib/api/songLookup";

interface BatchResult {
  query: string;
  title: string;
  artist: string;
  signed: number;
  unsigned: number;
  unknown: number;
  topPublisher: string;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
}

interface BatchUploadProps {
  selectedRegions: string[];
}

export const BatchUpload = ({ selectedRegions }: BatchUploadProps) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<BatchResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const cancelledRef = useRef(false);

  const handleStart = useCallback(async () => {
    const lines = input
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 20);

    if (lines.length === 0) return;

    cancelledRef.current = false;
    setIsProcessing(true);
    setProcessedCount(0);

    const initialResults: BatchResult[] = lines.map((q) => ({
      query: q,
      title: "",
      artist: "",
      signed: 0,
      unsigned: 0,
      unknown: 0,
      topPublisher: "",
      status: "pending",
    }));
    setResults(initialResults);

    const CONCURRENCY = 3;
    const updated = [...initialResults];

    for (let i = 0; i < lines.length; i += CONCURRENCY) {
      if (cancelledRef.current) break;

      const batch = lines.slice(i, i + CONCURRENCY);
      const batchIndices = batch.map((_, idx) => i + idx);

      batchIndices.forEach((idx) => {
        updated[idx] = { ...updated[idx], status: "loading" };
      });
      setResults([...updated]);

      await Promise.allSettled(
        batch.map(async (query, batchIdx) => {
          const idx = i + batchIdx;
          if (cancelledRef.current) return;

          try {
            const result = await lookupSong(query, [], true);
            if (cancelledRef.current) return;

            if (result.success && result.data) {
              const credits = result.data.credits;
              const signed = credits.filter((c) => c.publishingStatus === "signed").length;
              const unsigned = credits.filter((c) => c.publishingStatus === "unsigned").length;
              const unknown = credits.filter((c) => c.publishingStatus === "unknown").length;

              const pubCounts = new Map<string, number>();
              credits.forEach((c) => {
                if (c.publisher) pubCounts.set(c.publisher, (pubCounts.get(c.publisher) || 0) + 1);
              });
              const topPub = [...pubCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

              updated[idx] = {
                ...updated[idx],
                title: result.data.song.title,
                artist: result.data.song.artist,
                signed,
                unsigned,
                unknown,
                topPublisher: topPub,
                status: "done",
              };
            } else {
              updated[idx] = {
                ...updated[idx],
                status: "error",
                error: result.error || "Not found",
              };
            }
          } catch {
            updated[idx] = { ...updated[idx], status: "error", error: "Failed" };
          }
        })
      );

      setResults([...updated]);
      setProcessedCount(Math.min(i + CONCURRENCY, lines.length));
    }

    setIsProcessing(false);
  }, [input]);

  const handleCancel = () => {
    cancelledRef.current = true;
    setIsProcessing(false);
  };

  const exportCSV = () => {
    const headers = ["Query", "Song", "Artist", "Signed", "Unsigned", "Unknown", "Top Publisher", "Status"];
    const rows = results.map((r) => [
      r.query, r.title, r.artist, r.signed, r.unsigned, r.unknown, r.topPublisher, r.status,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalLines = input.split("\n").filter((l) => l.trim()).length;
  const progress = results.length > 0 ? (processedCount / results.length) * 100 : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="w-4 h-4" />
          Batch
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Batch Upload</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Input */}
          {!isProcessing && results.length === 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                Paste up to 20 song links or titles (one per line).
              </p>
              <Textarea
                placeholder={"https://open.spotify.com/track/...\nSong Title - Artist Name\nhttps://music.apple.com/..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={8}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {Math.min(totalLines, 20)} of 20 max
                </span>
                <Button onClick={handleStart} disabled={totalLines === 0}>
                  <Upload className="w-4 h-4 mr-1.5" />
                  Process {Math.min(totalLines, 20)} Songs
                </Button>
              </div>
            </>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm">
                    Processing {processedCount}/{results.length}...
                  </span>
                </div>
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  <Square className="w-3 h-3 mr-1" />
                  Stop
                </Button>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              {!isProcessing && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {results.filter((r) => r.status === "done").length}/{results.length} completed
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setResults([]);
                        setInput("");
                        setProcessedCount(0);
                      }}
                    >
                      New Batch
                    </Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Song</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead className="text-center">Signed</TableHead>
                      <TableHead className="text-center">Unsigned</TableHead>
                      <TableHead className="text-center">Unknown</TableHead>
                      <TableHead>Top Publisher</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-[150px] truncate text-sm">
                          {r.status === "loading" ? (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {r.query.slice(0, 30)}...
                            </span>
                          ) : r.status === "error" ? (
                            <span className="text-destructive text-xs">{r.query.slice(0, 30)}... ({r.error})</span>
                          ) : r.status === "pending" ? (
                            <span className="text-muted-foreground text-xs">{r.query.slice(0, 30)}...</span>
                          ) : (
                            r.title
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {r.artist || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.status === "done" && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                              {r.signed}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.status === "done" && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                              {r.unsigned}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.status === "done" && (
                            <Badge variant="outline" className="text-xs">
                              {r.unknown}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {r.topPublisher || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
