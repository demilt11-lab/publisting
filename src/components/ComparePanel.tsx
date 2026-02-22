import { useState, useCallback, useMemo } from "react";
import { GitCompareArrows, X, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Credit } from "./CreditsSection";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CompareSong {
  title: string;
  artist: string;
  credits: Credit[];
  spotifyStreams?: string;
  coverUrl?: string;
}

interface ComparePanelProps {
  songs: CompareSong[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

function calcDealScore(credits: Credit[]): string {
  if (credits.length === 0) return "N/A";
  let score = 0;
  // Publisher presence: 30pts
  const hasPub = credits.some(c => c.publisher);
  if (hasPub) score += 30;
  // Credit count: 0-20pts (max at 10+)
  score += Math.min(credits.length, 10) * 2;
  // Signed %: 0-30pts
  const signed = credits.filter(c => c.publisher).length;
  score += Math.round((signed / credits.length) * 30);
  // PRO coverage: 0-20pts
  const withPro = credits.filter(c => c.pro).length;
  score += Math.round((withPro / credits.length) * 20);
  return `${Math.min(score, 100)}/100`;
}

export const ComparePanel = ({ songs, onRemove, onClear }: ComparePanelProps) => {
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    if (songs.length === 0) return [];

    const getTopPublisher = (credits: Credit[]) => {
      const map = new Map<string, number>();
      credits.forEach(c => { if (c.publisher) map.set(c.publisher, (map.get(c.publisher) || 0) + 1); });
      return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
    };
    const getTopPRO = (credits: Credit[]) => {
      const map = new Map<string, number>();
      credits.forEach(c => { if (c.pro) map.set(c.pro, (map.get(c.pro) || 0) + 1); });
      return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
    };
    const getSignedPct = (credits: Credit[]) => {
      if (credits.length === 0) return "N/A";
      const signed = credits.filter(c => c.publisher).length;
      return `${Math.round((signed / credits.length) * 100)}%`;
    };

    return [
      { label: "Song Title", values: songs.map(s => s.title || "N/A") },
      { label: "Artist", values: songs.map(s => s.artist || "N/A") },
      { label: "Writers", values: songs.map(s => String(s.credits?.filter(c => c.role === "writer").length ?? 0)) },
      { label: "Producers", values: songs.map(s => String(s.credits?.filter(c => c.role === "producer").length ?? 0)) },
      { label: "Top Publisher", values: songs.map(s => getTopPublisher(s.credits || [])) },
      { label: "Top PRO", values: songs.map(s => getTopPRO(s.credits || [])) },
      { label: "Signed %", values: songs.map(s => getSignedPct(s.credits || [])) },
      { label: "Deal Score", values: songs.map(s => calcDealScore(s.credits || [])) },
    ];
  }, [songs]);

  const exportPDF = useCallback(() => {
    if (songs.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("PubCheck — Song Comparison", doc.internal.pageSize.getWidth() / 2, 15, { align: "center" });

    autoTable(doc, {
      startY: 25,
      head: [["", ...songs.map(s => s.title)]],
      body: rows.slice(1).map(r => [r.label, ...r.values]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save("song-comparison.pdf");
  }, [songs, rows]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative gap-1.5">
              <GitCompareArrows className="w-4 h-4" />
              <span className="hidden sm:inline">Compare</span>
              {songs.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                  {songs.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Compare songs</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5" /> Compare Songs
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {songs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Click the "+ Compare" button on any song card to add it (up to 3).
            </p>
          ) : (
            <>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={exportPDF}>
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={onClear}>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear All
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-2 text-muted-foreground font-medium w-28"></th>
                      {songs.map((s, i) => (
                        <th key={i} className="text-left p-2 font-medium">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[120px]">{s.title}</span>
                            <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1).map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2 text-muted-foreground font-medium text-xs">{row.label}</td>
                        {row.values.map((v, j) => (
                          <td key={j} className="p-2 text-foreground">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
