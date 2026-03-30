import { useState } from "react";
import { Download, Copy, Check, Braces, FileSpreadsheet, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Credit } from "./CreditsSection";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface CreditsExportProps {
  credits: Credit[];
  songTitle: string;
  artist: string;
  album?: string;
  isrc?: string;
  recordLabel?: string;
  streamingStats?: {
    spotifyStreams?: number | null;
    youtubeViews?: string | null;
    shazamCount?: number | null;
    geniusPageviews?: number | null;
  };
  chartPlacements?: { chart: string; peak: number; date?: string }[];
  onShare?: () => void;
  shareLabel?: string;
}

const sanitizeFilename = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_').trim();

export const CreditsExport = ({ credits, songTitle, artist, album, isrc, recordLabel, streamingStats, chartPlacements, onShare, shareLabel }: CreditsExportProps) => {
  const { toast } = useToast();
  const fileBase = `Publisting_${sanitizeFilename(artist)}_${sanitizeFilename(songTitle)}`;

  const generateCSV = () => {
    const BOM = '\uFEFF';
    const headers = ["Name", "Role", "Publisher", "PRO", "IPI", "Signed Status", "Region", "Pub Share %", "Record Label", "ISRC", "Spotify Streams", "YouTube Views", "Shazam Count", "Chart Placements"];
    const rows = credits.map((c) => {
      return [
        c.name, c.role, c.publisher || "", c.pro || "", c.ipi || "", c.publishingStatus || "",
        c.regionLabel || "", c.publishingShare ? `${c.publishingShare}%` : "",
        recordLabel || "", isrc || "",
        streamingStats?.spotifyStreams ? String(streamingStats.spotifyStreams) : "",
        streamingStats?.youtubeViews || "",
        streamingStats?.shazamCount ? String(streamingStats.shazamCount) : "",
        chartPlacements?.map(cp => `${cp.chart} #${cp.peak}${cp.date ? ` (${cp.date})` : ''}`).join('; ') || "",
      ];
    });
    const csvContent = BOM + [`# ${songTitle} - ${artist}`, album ? `# Album: ${album}` : "", isrc ? `# ISRC: ${isrc}` : "", recordLabel ? `# Label: ${recordLabel}` : "", "", headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(","))].filter(Boolean).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV downloaded" });
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("Publisting — Publishing Rights Lookup", pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text("Credit Report", pageWidth / 2, 22, { align: "center" });
    doc.setFontSize(12);
    doc.text(`${songTitle} - ${artist}`, pageWidth / 2, 30, { align: "center" });
    if (album) { doc.setFontSize(10); doc.setTextColor(100); doc.text(`Album: ${album}`, pageWidth / 2, 37, { align: "center" }); doc.setTextColor(0); }
    const signed = credits.filter((c) => c.publishingStatus === "signed").length;
    const unsigned = credits.filter((c) => c.publishingStatus === "unsigned").length;
    const unknown = credits.filter((c) => c.publishingStatus === "unknown").length;
    const writers = credits.filter((c) => c.role === "writer").length;
    const producers = credits.filter((c) => c.role === "producer").length;
    const artists_count = credits.filter((c) => c.role === "artist").length;
    doc.setFontSize(10);
    const statsY = album ? 45 : 40;
    doc.text(`Artists: ${artists_count}  |  Writers: ${writers}  |  Producers: ${producers}  |  Signed: ${signed}  |  Unsigned: ${unsigned}  |  Unknown: ${unknown}`, pageWidth / 2, statsY, { align: "center" });
    const tableData = credits.map((c) => [c.name, c.role.charAt(0).toUpperCase() + c.role.slice(1), c.publisher || "—", c.pro || "—", c.ipi || "—", c.publishingShare ? `${c.publishingShare}%` : "—", c.publishingStatus === "signed" ? "✓ Signed" : c.publishingStatus === "unsigned" ? "✗ Unsigned" : "? Unknown"]);
    autoTable(doc, { startY: statsY + 8, head: [["Name", "Role", "Publisher", "PRO", "IPI", "Share %", "Status"]], body: tableData, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }, bodyStyles: { textColor: [50, 50, 50] }, didParseCell: (data) => { if (data.section === "body" && data.column.index === 6) { const text = String(data.cell.raw); if (text.startsWith("✓")) data.cell.styles.textColor = [34, 139, 34]; else if (text.startsWith("✗")) data.cell.styles.textColor = [220, 38, 38]; else data.cell.styles.textColor = [150, 150, 150]; } }, alternateRowStyles: { fillColor: [241, 245, 249] } });
    doc.save(`${fileBase}.pdf`);
    toast({ title: "PDF downloaded" });
  };

  const handleCopyJson = () => {
    const json = JSON.stringify({
      song: { title: songTitle, artist, album: album || null, isrc: isrc || null, recordLabel: recordLabel || null },
      streamingStats: streamingStats || null,
      chartPlacements: chartPlacements || [],
      credits: credits.map((c) => ({
        name: c.name, role: c.role, publishingStatus: c.publishingStatus,
        publisher: c.publisher || null, pro: c.pro || null, ipi: c.ipi || null,
        publishingShare: c.publishingShare || null, region: c.regionLabel || null,
      })),
    }, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      toast({ title: "JSON copied!", description: "Credits data copied as JSON." });
    }).catch(() => { toast({ title: "Copy failed", variant: "destructive" }); });
  };

  const generateExcel = () => {
    const rows = credits.map((c) => ({
      Name: c.name,
      Role: c.role,
      Publisher: c.publisher || "",
      PRO: c.pro || "",
      IPI: c.ipi || "",
      "Share %": c.publishingShare ? `${c.publishingShare}%` : "",
      Status: c.publishingStatus || "",
      Region: c.regionLabel || "",
      "Record Label": recordLabel || "",
      ISRC: isrc || "",
      "Spotify Streams": streamingStats?.spotifyStreams ? String(streamingStats.spotifyStreams) : "",
      "YouTube Views": streamingStats?.youtubeViews || "",
      "Shazam Count": streamingStats?.shazamCount ? String(streamingStats.shazamCount) : "",
      "Genius Pageviews": streamingStats?.geniusPageviews ? String(streamingStats.geniusPageviews) : "",
      "Chart Placements": chartPlacements?.map(cp => `${cp.chart} #${cp.peak}${cp.date ? ` (${cp.date})` : ''}`).join('; ') || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credits");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
    toast({ title: "Excel downloaded" });
  };

  if (credits.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onShare && (
          <>
            <DropdownMenuItem onClick={onShare} className="gap-2">
              <Share2 className="w-4 h-4" />
              {shareLabel || "Share Link"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={generateCSV} className="gap-2">
          <Download className="w-4 h-4" />
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={generatePDF} className="gap-2">
          <Download className="w-4 h-4" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={generateExcel} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Download Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyJson} className="gap-2">
          <Braces className="w-4 h-4" />
          Copy as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
