import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listRefreshLog, getProviderHealth, retryRefresh } from "@/lib/api/publisting";
import { AdminGate } from "@/components/admin/AdminGate";
import { useToast } from "@/hooks/use-toast";

export default function AdminSyncHistory() { return <AdminGate><Inner/></AdminGate>; }
function Inner() {
  const [provider,setProvider]=useState("all");
  const [status,setStatus]=useState("all");
  const qc=useQueryClient(); const {toast}=useToast();
  const {data:rows=[],isLoading,refetch}=useQuery({queryKey:["sync-history",provider,status],queryFn:()=>listRefreshLog({source:provider==="all"?undefined:provider,status:status==="all"?undefined:status,limit:200})});
  const {data:health=[]}=useQuery({queryKey:["provider-health"],queryFn:getProviderHealth,refetchInterval:30_000});
  const retry=useMutation({mutationFn:(id:string)=>retryRefresh({refresh_log_id:id}),onSuccess:()=>{toast({title:"Retry triggered"});qc.invalidateQueries({queryKey:["sync-history"]});},onError:(e:any)=>toast({title:"Retry failed",description:e?.message,variant:"destructive"})});
  return (<div className="min-h-screen bg-background text-foreground"><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
    <div><Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link>
      <h1 className="text-2xl font-semibold mt-2">Sync history</h1>
      <p className="text-sm text-muted-foreground">Provider refresh log · retry failed runs · monitor health</p></div>
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Provider health (24h)</CardTitle></CardHeader><CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{(["spotify","genius","pro","soundcharts"] as const).map(p=>{const h=health.find(x=>x.provider===p);const pct=h?.success_pct_24h??null;const tone=pct==null?"text-muted-foreground":pct>=90?"text-emerald-300":pct>=60?"text-amber-300":"text-red-300";return (<div key={p} className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between"><div className="text-sm font-medium capitalize">{p}</div><Badge variant="outline" className={`text-[10px] ${tone}`}>{pct==null?"no data":`${pct}% ok`}</Badge></div><div className="text-[11px] text-muted-foreground mt-1">{h?<>{h.ok_runs_24h}/{h.total_runs_24h} ok · {h.error_runs_24h} err · {h.avg_latency_ms??"?"}ms</>:"Idle"}</div></div>);})}</div></CardContent></Card>
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Filters</CardTitle></CardHeader><CardContent className="flex gap-2 items-end">
      <Select value={provider} onValueChange={setProvider}><SelectTrigger className="w-[140px]"><SelectValue/></SelectTrigger><SelectContent>{["all","spotify","genius","pro","soundcharts"].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[140px]"><SelectValue/></SelectTrigger><SelectContent>{["all","ok","partial","error","running"].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
      <Button size="sm" variant="outline" onClick={()=>refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1"/>Reload</Button>
    </CardContent></Card>
    <Card><CardContent className="p-0">{isLoading?<div className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2"/>Loading…</div>:rows.length===0?<div className="p-6 text-center text-muted-foreground text-sm">No refresh runs.</div>:<div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left p-2">Provider</th><th className="text-left p-2">Entity</th><th className="text-left p-2">Status</th><th className="text-left p-2">Started</th><th className="text-left p-2">Notes</th><th className="text-right p-2"></th></tr></thead><tbody>{rows.map(r=>(<tr key={r.id} className="border-t border-border/50 hover:bg-muted/10"><td className="p-2 capitalize">{r.source}</td><td className="p-2 font-mono text-[11px]">{r.entity_type}/{r.pub_entity_id}</td><td className="p-2"><Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge></td><td className="p-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</td><td className="p-2 max-w-[280px] truncate">{r.error_text?<span className="text-red-300/80">{r.error_text}</span>:null}</td><td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={()=>retry.mutate(r.id)}><RefreshCw className="h-3 w-3"/></Button></td></tr>))}</tbody></table></div>}</CardContent></Card>
  </div></div>);
}
