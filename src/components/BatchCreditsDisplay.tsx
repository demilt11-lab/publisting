import { useState } from "react";
import { ChevronDown, ChevronUp, User, Building2, FileText, MapPin, Download, Mic2, PenTool, Music } from "lucide-react";
import { Credit } from "@/components/CreditsSection";
import { CreditCard } from "@/components/CreditCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TrackCredits {
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  credits: Credit[];
  sources: string[];
}

interface BatchCreditsDisplayProps {
  tracksCredits: TrackCredits[];
  onClose: () => void;
}

export const BatchCreditsDisplay = ({ tracksCredits, onClose }: BatchCreditsDisplayProps) => {
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(
    new Set(tracksCredits.map(t => t.trackId))
  );

  // Aggregate all unique credited people across all tracks
  const aggregatedCredits = new Map<string, {
    name: string;
    tracks: string[];
    roles: Set<string>;
    publishers: Set<string>;
    pros: Set<string>;
    ipis: Set<string>;
    regions: Set<string>;
  }>();

  tracksCredits.forEach(({ trackTitle, credits }) => {
    credits.forEach(credit => {
      const existing = aggregatedCredits.get(credit.name);
      if (existing) {
        existing.tracks.push(trackTitle);
        existing.roles.add(credit.role);
        if (credit.publisher) existing.publishers.add(credit.publisher);
        if (credit.pro) existing.pros.add(credit.pro);
        if (credit.ipi) existing.ipis.add(credit.ipi);
        if (credit.regionLabel) existing.regions.add(credit.regionLabel);
      } else {
        aggregatedCredits.set(credit.name, {
          name: credit.name,
          tracks: [trackTitle],
          roles: new Set([credit.role]),
          publishers: credit.publisher ? new Set([credit.publisher]) : new Set(),
          pros: credit.pro ? new Set([credit.pro]) : new Set(),
          ipis: credit.ipi ? new Set([credit.ipi]) : new Set(),
          regions: credit.regionLabel ? new Set([credit.regionLabel]) : new Set(),
        });
      }
    });
  });

  const toggleTrack = (trackId: string) => {
    const newExpanded = new Set(expandedTracks);
    if (newExpanded.has(trackId)) {
      newExpanded.delete(trackId);
    } else {
      newExpanded.add(trackId);
    }
    setExpandedTracks(newExpanded);
  };

  const totalCredits = tracksCredits.reduce((sum, t) => sum + t.credits.length, 0);
  const uniquePeople = aggregatedCredits.size;

  // Compute unique artists, writers, producers
  const uniqueArtists = new Set<string>();
  const uniqueWriters = new Set<string>();
  const uniqueProducers = new Set<string>();
  aggregatedCredits.forEach((person) => {
    person.roles.forEach(role => {
      const r = role.toLowerCase();
      if (r === 'artist' || r === 'primary artist' || r === 'featured artist') uniqueArtists.add(person.name);
      if (r === 'writer' || r === 'songwriter' || r === 'lyricist' || r === 'composer') uniqueWriters.add(person.name);
      if (r === 'producer' || r === 'executive producer' || r === 'co-producer') uniqueProducers.add(person.name);
    });
  });

  const generateCSV = () => {
    const headers = ['Name', 'Roles', 'Publisher', 'PRO', 'IPI', 'Tracks'];
    const rows = Array.from(aggregatedCredits.values()).map(p => [
      `"${p.name}"`,
      `"${Array.from(p.roles).join(', ')}"`,
      `"${Array.from(p.publishers).join(', ')}"`,
      `"${Array.from(p.pros).join(', ')}"`,
      `"${Array.from(p.ipis).join(', ')}"`,
      `"${p.tracks.join(', ')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'album-credits.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateTextReport = () => {
    let report = `ALBUM CREDITS REPORT\n${'='.repeat(50)}\n\n`;
    report += `Tracks Analyzed: ${tracksCredits.length}\n`;
    report += `Unique People: ${uniquePeople}\n`;
    report += `Artists: ${uniqueArtists.size} | Writers: ${uniqueWriters.size} | Producers: ${uniqueProducers.size}\n\n`;

    report += `ARTISTS\n${'-'.repeat(30)}\n`;
    uniqueArtists.forEach(name => {
      const p = aggregatedCredits.get(name)!;
      report += `${name}`;
      if (p.publishers.size) report += ` | Publisher: ${Array.from(p.publishers).join(', ')}`;
      if (p.pros.size) report += ` | PRO: ${Array.from(p.pros).join(', ')}`;
      report += `\n`;
    });

    report += `\nSONGWRITERS\n${'-'.repeat(30)}\n`;
    uniqueWriters.forEach(name => {
      const p = aggregatedCredits.get(name)!;
      report += `${name}`;
      if (p.publishers.size) report += ` | Publisher: ${Array.from(p.publishers).join(', ')}`;
      if (p.pros.size) report += ` | PRO: ${Array.from(p.pros).join(', ')}`;
      if (p.ipis.size) report += ` | IPI: ${Array.from(p.ipis).join(', ')}`;
      report += `\n`;
    });

    report += `\nPRODUCERS\n${'-'.repeat(30)}\n`;
    uniqueProducers.forEach(name => {
      const p = aggregatedCredits.get(name)!;
      report += `${name}`;
      if (p.publishers.size) report += ` | Publisher: ${Array.from(p.publishers).join(', ')}`;
      report += `\n`;
    });

    report += `\n\nTRACK-BY-TRACK BREAKDOWN\n${'='.repeat(50)}\n`;
    tracksCredits.forEach(({ trackTitle, trackArtist, credits }) => {
      report += `\n${trackTitle} - ${trackArtist}\n`;
      credits.forEach(c => {
        report += `  ${c.name} (${c.role})`;
        if (c.publisher) report += ` | ${c.publisher}`;
        if (c.pro) report += ` | ${c.pro}`;
        report += `\n`;
      });
    });

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'album-credits-report.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Album Credits Report", pageWidth / 2, 20, { align: "center" });

    // Summary stats
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Tracks: ${tracksCredits.length}  |  Artists: ${uniqueArtists.size}  |  Songwriters: ${uniqueWriters.size}  |  Producers: ${uniqueProducers.size}`, pageWidth / 2, 28, { align: "center" });

    // All Credits table
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("All Credited People", 14, 38);

    const allPeople = Array.from(aggregatedCredits.values()).sort((a, b) => b.tracks.length - a.tracks.length);
    autoTable(doc, {
      startY: 42,
      head: [['Name', 'Roles', 'Publisher', 'PRO', 'IPI', '# Tracks']],
      body: allPeople.map(p => [
        p.name,
        Array.from(p.roles).join(', '),
        Array.from(p.publishers).join(', ') || '—',
        Array.from(p.pros).join(', ') || '—',
        Array.from(p.ipis).join(', ') || '—',
        String(p.tracks.length),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
      columnStyles: { 5: { halign: 'center' } },
    });

    // Track-by-track breakdown
    tracksCredits.forEach(({ trackTitle, trackArtist, credits }) => {
      const finalY = (doc as any).lastAutoTable?.finalY || doc.internal.pageSize.getHeight() - 40;
      if (finalY > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
      }

      const startY = ((doc as any).lastAutoTable?.finalY || 45) + 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${trackTitle} — ${trackArtist}`, 14, startY);

      autoTable(doc, {
        startY: startY + 3,
        head: [['Name', 'Role', 'Publisher', 'PRO', 'IPI']],
        body: credits.map(c => [
          c.name,
          c.role,
          c.publisher || '—',
          c.pro || '—',
          c.ipi || '—',
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [90, 90, 90], fontSize: 7 },
      });
    });

    doc.save('album-credits-report.pdf');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Summary Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-display text-2xl font-bold text-foreground">
            Album Credits Summary
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={generateCSV}>
              <Download className="w-4 h-4 mr-1.5" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={generatePDF}>
              <Download className="w-4 h-4 mr-1.5" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={generateTextReport}>
              <FileText className="w-4 h-4 mr-1.5" />
              Report
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 text-sm mb-5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
            <FileText className="w-4 h-4 text-primary" />
            <span>{tracksCredits.length} tracks analyzed</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
            <User className="w-4 h-4 text-primary" />
            <span>{uniquePeople} unique credited people</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
            <Building2 className="w-4 h-4 text-primary" />
            <span>{totalCredits} total credits</span>
          </div>
        </div>

        {/* Role breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-secondary/60 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Mic2 className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Artists</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{uniqueArtists.size}</p>
            <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
              {Array.from(uniqueArtists).map(name => (
                <p key={name} className="text-xs text-muted-foreground truncate">{name}</p>
              ))}
            </div>
          </div>
          <div className="p-4 bg-secondary/60 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <PenTool className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Songwriters</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{uniqueWriters.size}</p>
            <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
              {Array.from(uniqueWriters).map(name => (
                <p key={name} className="text-xs text-muted-foreground truncate">{name}</p>
              ))}
            </div>
          </div>
          <div className="p-4 bg-secondary/60 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Producers</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{uniqueProducers.size}</p>
            <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
              {Array.from(uniqueProducers).map(name => (
                <p key={name} className="text-xs text-muted-foreground truncate">{name}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Aggregated Credits View */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">
          All Credited People
        </h3>
        <div className="space-y-3">
          {Array.from(aggregatedCredits.values())
            .sort((a, b) => b.tracks.length - a.tracks.length)
            .map((person) => (
              <div 
                key={person.name}
                className="p-4 bg-secondary/50 rounded-xl border border-border/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-foreground">{person.name}</h4>
                      {Array.from(person.regions).map(region => (
                        <span key={region} className="text-xs text-muted-foreground">
                          {region}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from(person.roles).map(role => (
                        <Badge key={role} variant="secondary" className="text-xs capitalize">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {person.tracks.length} track{person.tracks.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                <div className="mt-3 grid gap-2 text-sm">
                  {person.publishers.size > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Publisher: {Array.from(person.publishers).join(', ')}</span>
                    </div>
                  )}
                  {person.pros.size > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>PRO: {Array.from(person.pros).join(', ')}</span>
                    </div>
                  )}
                  {person.ipis.size > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      <span>IPI: {Array.from(person.ipis).join(', ')}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Appears on: {person.tracks.slice(0, 5).join(', ')}
                    {person.tracks.length > 5 && ` +${person.tracks.length - 5} more`}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Per-Track Breakdown */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">
          Track-by-Track Breakdown
        </h3>
        <div className="space-y-2">
          {tracksCredits.map(({ trackId, trackTitle, trackArtist, credits, sources }) => (
            <div key={trackId} className="border border-border/50 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleTrack(trackId)}
                className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-foreground">{trackTitle}</p>
                  <p className="text-sm text-muted-foreground">{trackArtist}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{credits.length} credits</Badge>
                  {expandedTracks.has(trackId) ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>
              
              {expandedTracks.has(trackId) && (
                <div className="border-t border-border/50 p-4 bg-secondary/20">
                  <div className="space-y-2">
                    {credits.map((credit, idx) => (
                      <CreditCard 
                        key={`${credit.name}-${idx}`} 
                        name={credit.name}
                        role={credit.role}
                        publishingStatus={credit.publishingStatus}
                        publisher={credit.publisher}
                        ipi={credit.ipi}
                        pro={credit.pro}
                        region={credit.region}
                        regionFlag={credit.regionFlag}
                        regionLabel={credit.regionLabel}
                      />
                    ))}
                  </div>
                  {sources.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Sources: {sources.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Close Button */}
      <div className="flex justify-center">
        <Button onClick={onClose} variant="outline">
          Start New Search
        </Button>
      </div>
    </div>
  );
};

export type { TrackCredits };
