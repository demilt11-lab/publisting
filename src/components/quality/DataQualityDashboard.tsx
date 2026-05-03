import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Database, AlertTriangle, GitMerge, CheckCircle2 } from "lucide-react";
import { fetchDataQualityDashboard, forceRevalidateAllCaches } from "@/lib/api/dataQuality";
import { useToast } from "@/hooks/use-toast";

interface Props {
  variant?: "compact" | "full";
  showRevalidate?: boolean;
}

export function DataQualityDashboard({ variant = "full", showRevalidate = true }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["data-quality-dashboard"],
    queryFn: fetchDataQualityDashboard,
    staleTime: 60_000,
  });
  const revalidate = useMutation({
    mutationFn: forceRevalidateAllCaches,
    onSuccess: (res: any) => {
      const inv = res?.invalidated ?? {};
      toast({ title: "Caches invalidated", description: `Spotify ${inv.spotify ?? 0} · Soundcharts ${inv.soundcharts ?? 0} · Genius ${inv.genius ?? 0}` });
      qc.invalidateQueries({ queryKey: ["data-quality-dashboard"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message ?? String(e), variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <Card className="bg-card border-border"><CardContent className="p-4 text-sm text-muted-foreground">Loading data quality…</CardContent></Card>;
  }

  const compact = variant === "compact";
  return (
    <div className="space-y-4">
      <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 md:grid-cols-4 gap-3"}>
        <Card className="bg-card border-border">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Catalog completeness</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{data.overall_completeness}%</div>
            <Progress value={data.overall_completeness} className="h-1.5 mt-2" />
            <div className="text-[11px] text-muted-foreground mt-1">{data.total_records} scored records</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Flagged for review</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{data.flagged_records}</div>
            <div className="text-[11px] text-muted-foreground mt-2">{data.low_quality_records} below 50% complete</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><GitMerge className="h-3 w-3" /> Pending duplicates</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{data.pending_duplicates}</div>
            <div className="text-[11px] text-muted-foreground mt-2">{data.auto_merged_duplicates} auto-merged</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Database className="h-3 w-3" /> Cache hit rate</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            {(["spotify", "soundcharts", "genius"] as const).map((src) => (
              <div key={src} className="flex items-center justify-between text-[11px]">
                <span className="capitalize text-muted-foreground">{src}</span>
                <Badge variant="outline" className="text-[10px]">
                  {data.caches[src].hit_rate}% · {data.caches[src].fresh}/{data.caches[src].total}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {showRevalidate && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => revalidate.mutate()} disabled={revalidate.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${revalidate.isPending ? "animate-spin" : ""}`} />
            Force revalidate all cached data
          </Button>
          <span className="text-[11px] text-muted-foreground">Marks every cached entry as expired so the next lookup re-fetches.</span>
        </div>
      )}
    </div>
  );
}