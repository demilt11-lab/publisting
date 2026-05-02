import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Latest daily digest summary for the signed-in user. */
export function DigestSummary() {
  const { user } = useAuth();
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("digest_runs").select("*")
        .eq("user_id", user.id).order("period_end", { ascending: false }).limit(1);
      if (alive) { setRow(data?.[0] ?? null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (!user) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
          <Newspaper className="w-3.5 h-3.5" /> Today's digest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? <div className="text-xs text-muted-foreground">Loading…</div>
         : !row ? <div className="text-xs text-muted-foreground">No digest yet — runs daily at 08:00 UTC.</div>
         : (
           <div className="space-y-1.5">
             <div className="flex items-center gap-2 flex-wrap">
               <Badge variant="outline" className="text-[10px]">{row.alert_count} alerts</Badge>
               {row.summary?.new_collaborators > 0 && (
                 <Badge variant="outline" className="text-[10px]">{row.summary.new_collaborators} new collaborators</Badge>
               )}
               {row.summary?.missing_credits > 0 && (
                 <Badge variant="outline" className="text-[10px]">{row.summary.missing_credits} missing credits</Badge>
               )}
               {row.summary?.confidence_changes > 0 && (
                 <Badge variant="outline" className="text-[10px]">{row.summary.confidence_changes} confidence changes</Badge>
               )}
             </div>
             {row.summary?.top_movers?.length > 0 && (
               <div className="space-y-1">
                 <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Top movers</div>
                 {row.summary.top_movers.slice(0, 4).map((m: any, i: number) => (
                   <div key={i} className="flex items-center justify-between border border-border/40 rounded px-2 py-1 text-xs">
                     <span className="truncate">{m.label}</span><Badge>{m.alerts}</Badge>
                   </div>
                 ))}
               </div>
             )}
           </div>
         )}
      </CardContent>
    </Card>
  );
}