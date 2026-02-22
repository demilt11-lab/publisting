import { useState } from "react";
import { Download, Copy, Check, Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CreditsExportProps {
  credits: Credit[];
  songTitle: string;
  artist: string;
  album?: string;
}

export const CreditsExport = ({ credits, songTitle, artist, album }: CreditsExportProps) => {
  const [jsonCopied, setJsonCopied] = useState(false);
  const { toast } = useToast();

  const generateCSV = () => {
    const headers = ["Name", "Role", "Publisher", "PRO", "IPI", "Signed Status", "Region", "Pub Share %", "Spotify", "Genius", "Instagram"];
    const rows = credits.map((c) => {
      const encodedName = encodeURIComponent(c.name);
      const handleName = c.name.replace(/\s+/g, '').toLowerCase();
      const slugName = c.name.replace(/\s+/g, '-').toLowerCase();
      return [
        c.name,
        c.role,
        c.publisher || "",
        c.pro || "",
        c.ipi || "",
        c.publishingStatus || "",
        c.regionLabel || "",
        c.publishingShare ? `${c.publishingShare}%` : "",
        `https://open.spotify.com/search/${encodedName}/artists`,
        `https://genius.com/artists/${slugName}`,
        `https://www.instagram.com/${handleName}`,
      ];
    });

    const csvContent = [
      `# ${songTitle} - ${artist}`,
      album ? `# Album: ${album}` : "",
      "",
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")),
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${songTitle} - ${artist} Credits.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Branding
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("PubCheck — Publishing Rights Lookup", pageWidth / 2, 12, { align: "center" });

    // Title
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text("Credit Report", pageWidth / 2, 22, { align: "center" });

    doc.setFontSize(12);
    doc.text(`${songTitle} - ${artist}`, pageWidth / 2, 30, { align: "center" });

    if (album) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Album: ${album}`, pageWidth / 2, 37, { align: "center" });
      doc.setTextColor(0);
    }

    // Stats
    const signed = credits.filter((c) => c.publishingStatus === "signed").length;
    const unsigned = credits.filter((c) => c.publishingStatus === "unsigned").length;
    const unknown = credits.filter((c) => c.publishingStatus === "unknown").length;
    const writers = credits.filter((c) => c.role === "writer").length;
    const producers = credits.filter((c) => c.role === "producer").length;
    const artists_count = credits.filter((c) => c.role === "artist").length;

    doc.setFontSize(10);
    const statsY = album ? 45 : 40;
    doc.text(
      `Artists: ${artists_count}  |  Writers: ${writers}  |  Producers: ${producers}  |  Signed: ${signed}  |  Unsigned: ${unsigned}  |  Unknown: ${unknown}`,
      pageWidth / 2,
      statsY,
      { align: "center" }
    );

    // Table with color-coded rows
    const tableData = credits.map((c) => [
      c.name,
      c.role.charAt(0).toUpperCase() + c.role.slice(1),
      c.publisher || "—",
      c.pro || "—",
      c.ipi || "—",
      c.publishingShare ? `${c.publishingShare}%` : "—",
      c.publishingStatus === "signed" ? "✓ Signed" : c.publishingStatus === "unsigned" ? "✗ Unsigned" : "? Unknown",
    ]);

    autoTable(doc, {
      startY: statsY + 8,
      head: [["Name", "Role", "Publisher", "PRO", "IPI", "Share %", "Status"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      bodyStyles: { textColor: [50, 50, 50] },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const text = String(data.cell.raw);
          if (text.startsWith("✓")) {
            data.cell.styles.textColor = [34, 139, 34];
          } else if (text.startsWith("✗")) {
            data.cell.styles.textColor = [220, 38, 38];
          } else {
            data.cell.styles.textColor = [150, 150, 150];
          }
        }
      },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    doc.save(`${songTitle} - ${artist} Credits.pdf`);
  };

  const handleCopyJson = () => {
    const json = JSON.stringify(
      {
        song: { title: songTitle, artist, album },
        credits: credits.map((c) => ({
          name: c.name,
          role: c.role,
          publishingStatus: c.publishingStatus,
          publisher: c.publisher || null,
          pro: c.pro || null,
          ipi: c.ipi || null,
          publishingShare: c.publishingShare || null,
          region: c.regionLabel || null,
        })),
      },
      null,
      2
    );
    navigator.clipboard.writeText(json).then(() => {
      setJsonCopied(true);
      toast({ title: "JSON copied!", description: "Credits data copied as JSON." });
      setTimeout(() => setJsonCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Copy failed", variant: "destructive" });
    });
  };

  if (credits.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={generateCSV}>
        <Download className="w-4 h-4 mr-1.5" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={generatePDF}>
        <Download className="w-4 h-4 mr-1.5" />
        PDF
      </Button>
      <Button variant="outline" size="sm" onClick={handleCopyJson}>
        {jsonCopied ? <Check className="w-4 h-4 mr-1.5" /> : <Braces className="w-4 h-4 mr-1.5" />}
        {jsonCopied ? "Copied!" : "JSON"}
      </Button>
    </div>
  );
};
