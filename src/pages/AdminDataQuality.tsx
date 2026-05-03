import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGate } from "@/components/admin/AdminGate";
import { DataQualityDashboard } from "@/components/quality/DataQualityDashboard";
import { useMutation } from "@tanstack/react-query";
import { runDedupScan } from "@/lib/api/dataQuality";
import { useToast } from "@/hooks/use-toast";

const AdminDataQuality = () => {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const scan = useMutation({
    mutationFn: (t: "track" | "artist" | "creator") => runDedupScan(t, true),
    onMutate: (t) => setRunning(t),
    onSuccess: (res: any) => toast({
      title: "Dedup scan complete",
      description: `Scanned ${res.scanned} · Pairs ${res.pairs_found} · Auto-merged ${res.auto_merged}`,
    }),
    onError: (e: any) => toast({ title: "Scan failed", description: e?.message ?? String(e), variant: "destructive" }),
    onSettled: () => setRunning(null),
  });

  return (
    <AdminGate>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
            <h1 className="text-xl font-semibold">Data quality</h1>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          <DataQualityDashboard />
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Deduplication scan</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Scans entities for likely duplicates using normalized title+artist keys. Auto-merges pairs ≥ 95% similar with matching ISRC; the rest queue for review.
              </p>
              <div className="flex gap-2 flex-wrap">
                {(["track", "artist", "creator"] as const).map((t) => (
                  <Button key={t} size="sm" variant="outline" disabled={!!running} onClick={() => scan.mutate(t)}>
                    <Search className="h-3.5 w-3.5 mr-2" />
                    {running === t ? "Scanning…" : `Scan ${t}s`}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </AdminGate>
  );
};

export default AdminDataQuality;