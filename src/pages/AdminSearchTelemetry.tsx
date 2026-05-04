import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin/AdminGate";

interface SE { id:string; query:string; query_type:string|null; entity_type:string|null; clicked_rank:number|null; result_count:number|null; fallback_used:boolean; zero_result:boolean; source_used:string|null; created_at:string; }
export default function AdminSearchTelemetry(){return <AdminGate><Inner/></AdminGate>;}
function Inner(){
  // Keyset pagination on (created_at desc, id desc) — page size 100, cursor = last row.
  const PAGE = 100;
  const [cursor, setCursor] = useState<{ created_at: string; id: string } | null>(null);
  const [pages, setPages] = useState<SE[][]>([]);
  const { data: events = [], isFetching } = useQuery({
    queryKey: ["search-telemetry", cursor?.created_at ?? "head", cursor?.id ?? ""],
    queryFn: async () => {
      let q = supabase.from("search_events").select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (cursor) {
        q = q.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      }
      const { data } = await q;
      return (data ?? []) as SE[];
    },
    refetchInterval: cursor ? false : 30_000,
  });
  const hasMore = events.length > PAGE;
  const visible = (hasMore ? events.slice(0, PAGE) : events);
  const merged = [...pages.flat(), ...visible];
  function loadMore() {
    const last = visible[visible.length - 1];
    if (!last) return;
    setPages((p) => [...p, visible]);
    setCursor({ created_at: last.created_at, id: last.id });
  }
  const allEvents = merged;
  const total=events.length, zero=events.filter(e=>e.zero_result).length, fb=events.filter(e=>e.fallback_used).length, clicked=events.filter(e=>e.clicked_rank!=null).length;
  const zMap=new Map<string,number>(); for(const e of allEvents) if(e.zero_result) zMap.set(e.query,(zMap.get(e.query)??0)+1);
  const topZero=[...zMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  const Stat=({label,value,warn}:{label:string;value:number;warn?:boolean})=>(<div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={`text-2xl font-semibold tabular-nums ${warn?"text-amber-300":""}`}>{value}</div></div>);
  return (<div className="min-h-screen bg-background text-foreground"><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
    <div><Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5"/> Home</Link><h1 className="text-2xl font-semibold mt-2">Search telemetry</h1><p className="text-sm text-muted-foreground">Last {PAGE} events · clicks · fallback · zero-result queries · keyset paginated</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Total" value={total}/><Stat label="Zero-result" value={zero} warn={zero>total*0.2}/><Stat label="Fallback" value={fb} warn={fb>total*0.3}/><Stat label="Clicked" value={clicked}/></div>
    {topZero.length>0&&(<Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top zero-result queries</CardTitle></CardHeader><CardContent><div className="flex flex-wrap gap-2">{topZero.map(([q,n])=><Badge key={q} variant="outline" className="text-amber-300 border-amber-500/40">{q} · {n}</Badge>)}</div></CardContent></Card>)}
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Recent events</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left p-2">When</th><th className="text-left p-2">Query</th><th className="text-left p-2">Type</th><th className="text-left p-2">Source</th><th className="text-right p-2">Results</th><th className="text-right p-2">Click</th><th className="text-left p-2">Flags</th></tr></thead><tbody>{allEvents.map(e=>(<tr key={e.id} className="border-t border-border/50"><td className="p-2 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td><td className="p-2 font-mono">{e.query}</td><td className="p-2"><Badge variant="outline" className="text-[10px]">{e.query_type??"—"}</Badge></td><td className="p-2 text-muted-foreground">{e.source_used??"—"}</td><td className="p-2 text-right tabular-nums">{e.result_count??"—"}</td><td className="p-2 text-right tabular-nums">{e.clicked_rank??"—"}</td><td className="p-2 space-x-1">{e.zero_result&&<Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">zero</Badge>}{e.fallback_used&&<Badge variant="outline" className="text-[10px] text-blue-300 border-blue-500/40">fallback</Badge>}</td></tr>))}</tbody></table></div>{hasMore&&(<div className="p-3 flex justify-center border-t border-border/50"><Button variant="outline" size="sm" onClick={loadMore} disabled={isFetching}>{isFetching?"Loading…":"Load more"}</Button></div>)}</CardContent></Card>
  </div></div>);
}
