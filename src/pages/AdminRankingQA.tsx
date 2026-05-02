import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchRankDebug, getRankingWeights, updateRankingWeights, type RankedDebugRow, type RankingWeights } from "@/lib/api/publisting";
import { AdminGate } from "@/components/admin/AdminGate";
import { useToast } from "@/hooks/use-toast";

export default function AdminRankingQA(){return <AdminGate><Inner/></AdminGate>;}
function Inner(){
  const [q,setQ]=useState(""); const [results,setResults]=useState<RankedDebugRow[]>([]);
  const qc=useQueryClient(); const {toast}=useToast();
  const {data:weights}=useQuery({queryKey:["ranking-weights"],queryFn:getRankingWeights});
  const search=useMutation({mutationFn:()=>searchRankDebug({q,limit:30}),onSuccess:r=>setResults(r.results??[])});
  const save=useMutation({mutationFn:(p:Partial<RankingWeights>)=>updateRankingWeights(p),onSuccess:()=>{toast({title:"Weights updated"});qc.invalidateQueries({queryKey:["ranking-weights"]});}});
  const [w,setW]=useState<Partial<RankingWeights>>({});
  const ww={...(weights??{}),...w} as RankingWeights;
  return (<div className="min-h-screen bg-background text-foreground"><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
    <div><Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link><h1 className="text-2xl font-semibold mt-2">Ranking QA</h1><p className="text-sm text-muted-foreground">Inspect search ranking with per-row score breakdown · tune global weights.</p></div>
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Run debug query</CardTitle></CardHeader><CardContent><form onSubmit={e=>{e.preventDefault();search.mutate();}} className="flex gap-2"><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Try a name, ISRC, or URL"/><Button disabled={!q.trim()||search.isPending}>{search.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:"Run"}</Button></form></CardContent></Card>
    {weights&&(<Card><CardHeader className="pb-2"><CardTitle className="text-sm">Weights</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{(["weight_confidence","weight_popularity","weight_activity","weight_coverage","weight_trust","conflict_penalty"] as const).map(k=>(<label key={k} className="flex flex-col gap-1"><span className="text-[10px] uppercase text-muted-foreground">{k.replace("weight_","")}</span><Input type="number" step="0.05" value={Number(ww[k]??0)} onChange={e=>setW({...w,[k]:Number(e.target.value)})}/></label>))}</div><div className="mt-2 text-right"><Button size="sm" onClick={()=>save.mutate(w)} disabled={save.isPending}>{save.isPending?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:"Save"}</Button></div></CardContent></Card>)}
    {results.length>0&&(<Card><CardHeader className="pb-2"><CardTitle className="text-sm">Ranked results</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left p-2">#</th><th className="text-left p-2">Entity</th><th className="text-left p-2">Matched</th><th className="text-right p-2">Conf</th><th className="text-right p-2">Pop</th><th className="text-right p-2">Cov</th><th className="text-right p-2">Trust</th><th className="text-right p-2">Rank</th></tr></thead><tbody>{results.map((r,i)=>(<tr key={`${r.entity_type}:${r.pub_entity_id}`} className="border-t border-border/50"><td className="p-2 text-muted-foreground">{i+1}</td><td className="p-2"><div className="font-medium">{r.display_name}</div><div className="text-[10px] text-muted-foreground capitalize">{r.entity_type} · <span className="font-mono">{r.pub_entity_id}</span></div></td><td className="p-2"><Badge variant="outline" className="text-[10px]">{r.matched_on}</Badge></td><td className="p-2 text-right tabular-nums">{r.weighted_confidence}<div className="text-[10px] text-muted-foreground">{r.base_confidence}</div></td><td className="p-2 text-right tabular-nums">{r.weighted_popularity}</td><td className="p-2 text-right tabular-nums">{r.weighted_coverage}</td><td className="p-2 text-right tabular-nums">{r.weighted_trust}</td><td className="p-2 text-right tabular-nums font-medium">{r.rank}</td></tr>))}</tbody></table></div></CardContent></Card>)}
  </div></div>);
}
