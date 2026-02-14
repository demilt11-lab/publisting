import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CreditsExportProps {
  credits: Credit[];
  songTitle: string;
  artist: string;
  album?: string;
}

export const CreditsExport = ({ credits, songTitle, artist, album }: CreditsExportProps) => {
  const generateCSV = () => {
    const headers = ["Name", "Role", "Publisher", "PRO", "IPI", "Region"];
    const rows = credits.map((c) => [
      c.name,
      c.role,
      c.publisher || "",
      c.pro || "",
      c.ipi || "",
      c.regionLabel || "",
    ]);

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

    // Title
    doc.setFontSize(18);
    doc.text("Credit Report", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`${songTitle} - ${artist}`, pageWidth / 2, 30, { align: "center" });

    if (album) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Album: ${album}`, pageWidth / 2, 37, { align: "center" });
      doc.setTextColor(0);
    }

    // Stats
    const artists = credits.filter((c) => c.role === "artist").length;
    const writers = credits.filter((c) => c.role === "writer").length;
    const producers = credits.filter((c) => c.role === "producer").length;
    const signed = credits.filter((c) => c.publishingStatus === "signed").length;

    doc.setFontSize(10);
    const statsY = album ? 45 : 40;
    doc.text(
      `Artists: ${artists}  |  Writers: ${writers}  |  Producers: ${producers}  |  Signed: ${signed}/${credits.length}`,
      pageWidth / 2,
      statsY,
      { align: "center" }
    );

    // Table
    const tableData = credits.map((c) => [
      c.name,
      c.role.charAt(0).toUpperCase() + c.role.slice(1),
      c.publisher || "—",
      c.pro || "—",
      c.ipi || "—",
      c.regionLabel || "—",
    ]);

    autoTable(doc, {
      startY: statsY + 8,
      head: [["Name", "Role", "Publisher", "PRO", "IPI", "Region"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    doc.save(`${songTitle} - ${artist} Credits.pdf`);
  };

  if (credits.length === 0) return null;

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={generateCSV}>
        <Download className="w-4 h-4 mr-1.5" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={generatePDF}>
        <Download className="w-4 h-4 mr-1.5" />
        PDF
      </Button>
    </div>
  );
};
