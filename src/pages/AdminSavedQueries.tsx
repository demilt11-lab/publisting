import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, BellOff, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSavedQueries, listSavedQueryRuns, runSavedQuery, setSavedQuerySubscription, type SavedQuery, type SavedQueryRun } from "@/lib/api/publisting";
import { AdminGate } from "@/components/admin/AdminGate";
import { useToast } from "@/hooks/use-toast";

export default function AdminSavedQueries(){return <AdminGate><Inner/></AdminGate>;}
function Inner(){
  const [picked,setPicked]=useState<SavedQuery|null>(null);
  const qc=useQueryClient(); const {toast}=useToast();
  const {data:queries=[]}=useQuery({queryKey:["saved-queries"],queryFn:listSavedQueries});
  const {data:runs=[]}=useQuery({queryKey:["saved-query-runs",picked?.id],queryFn:()=>picked?listSavedQueryRuns(picked.id,25):Promise.resolve([] as SavedQueryRun[]),enabled:!!picked});
  const runNow=useMutation({mutationFn:(id:string)=>runSavedQuery(id),onSuccess:r=>{toast({title:`Ran · ${r.result_count} results · Δ +${r.added}/-${r.removed}`});qc.invalidateQueries({queryKey:["saved-query-runs"]});},onError:(e:any)=>toast({title:"Run failed",description:e?.message,variant:"destructive"})});
  const toggleSub=useMutation({mutationFn:({id,sub}:{id:string;sub:boolean})=>setSavedQuerySubscription(id,sub),onSuccess:()=>qc.invalidateQueries({queryKey:["saved-queries"]})});
  const next=(()=>{const d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);return d;})();
  return (<div className="min-h-screen bg-background text-foreground"><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
    <div><Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link><h1 className="text-2xl font-semibold mt-2">Saved queries</h1><p className="text-sm text-muted-foreground">Subscribed queries run hourly · next: <span className="tabular-nums">{next.toLocaleString()}</span></p></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Queries</CardTitle></CardHeader><CardContent className="p-0">{queries.length===0?<div className="p-6 text-sm text-muted-foreground">No saved queries yet.</div>:<div className="divide-y divide-border/50">{queries.map(q=>(<button key={q.id} onClick={()=>setPicked(q)} className={`w-full text-left p-3 hover:bg-muted/10 ${picked?.id===q.id?"bg-muted/20":""}`}><div className="flex items-center justify-between"><div className="font-medium">{q.name}</div><Badge variant="outline" className="text-[10px]">{q.is_subscribed?"subscribed":"off"}</Badge></div><div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{JSON.stringify(q.query_json)}</div><div className="flex gap-1 mt-2"><Button size="sm" variant="ghost" onClick={e=>{e.stopPropagation();runNow.mutate(q.id);}}>{runNow.isPending?<Loader2 className="h-3 w-3 animate-spin mr-1"/>:<Play className="h-3 w-3 mr-1"/>}Run now</Button><Button size="sm" variant="ghost" onClick={e=>{e.stopPropagation();toggleSub.mutate({id:q.id,sub:!q.is_subscribed});}}>{q.is_subscribed?<><BellOff className="h-3 w-3 mr-1"/>Unsubscribe</>:<><Bell className="h-3 w-3 mr-1"/>Subscribe</>}</Button></div></button>))}</div>}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Run history{picked?` · ${picked.name}`:""}</CardTitle></CardHeader><CardContent>{!picked?<div className="text-sm text-muted-foreground">Pick a query.</div>:runs.length===0?<div className="text-sm text-muted-foreground">No runs yet.</div>:<div className="space-y-2">{runs.map(r=>(<div key={r.id} className="rounded-md border border-border bg-card p-2 text-xs"><div className="flex items-center justify-between"><div className="text-muted-foreground">{new Date(r.run_at).toLocaleString()}</div><div className="flex gap-1"><Badge variant="outline">{r.result_count} results</Badge>{r.diff_count>0&&<Badge variant="outline" className="text-emerald-300 border-emerald-500/40">Δ {r.diff_count}</Badge>}</div></div>{(r.added?.length??0)>0&&<div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">New</div><div className="flex flex-wrap gap-1 mt-1">{r.added.slice(0,8).map((a:any,i:number)=><Badge key={i} variant="outline" className="text-[10px]">{a.display_name}</Badge>)}</div></div>}{(r.removed?.length??0)>0&&<div className="mt-1"><div className="text-[10px] uppercase text-muted-foreground">Removed</div><div className="flex flex-wrap gap-1 mt-1">{r.removed.slice(0,8).map((a:any,i:number)=><Badge key={i} variant="outline" className="text-[10px] text-muted-foreground">{a.display_name}</Badge>)}</div></div>}</div>))}</div>}</CardContent></Card>
    </div>
  </div></div>);
}
