import { useEffect, useState } from "react";
import { Bell, AlertTriangle, TrendingDown, GitMerge, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { fetchAlerts, markRead, dismiss, type LookupAlert } from "@/lib/api/lookupAlerts";
import { cn } from "@/lib/utils";

const sevColor: Record<string, string> = {
  high: "text-destructive",
  warn: "text-amber-400",
  info: "text-muted-foreground",
};

const kindIcon: Record<string, any> = {
  spike: TrendingDown,
  confidence_drop: AlertTriangle,
  source_conflict: GitMerge,
};

export const LookupAlertsBell = () => {
  const [alerts, setAlerts] = useState<LookupAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAlerts(await fetchAlerts(25)); } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("lookup-alerts-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lookup_alerts" }, (p) => {
        setAlerts((prev) => [p.new as any, ...prev].slice(0, 25));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const unread = alerts.filter((a) => !a.read_at && !a.dismissed_at).length;

  const handleMark = async (id: string) => {
    await markRead(id);
    setAlerts((p) => p.map((a) => (a.id === id ? { ...a, read_at: new Date().toISOString() } : a)));
  };
  const handleDismiss = async (id: string) => {
    await dismiss(id);
    setAlerts((p) => p.filter((a) => a.id !== id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8 relative" aria-label="Lookup alerts">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center px-1 animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold">Lookup Alerts</p>
            {unread > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{unread} new</Badge>}
          </div>
          <Link to="/alerts" onClick={() => setOpen(false)}>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]">View all</Button>
          </Link>
        </div>
        <ScrollArea className="max-h-96">
          {loading ? (
            <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No alerts yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Spikes, confidence drops, and conflicts appear here.</p>
            </div>
          ) : (
            <div>
              {alerts.map((a) => {
                const Icon = kindIcon[a.kind] || Bell;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "px-3 py-2 border-b border-border/30 hover:bg-muted/30 group cursor-pointer",
                      !a.read_at && "bg-primary/5",
                    )}
                    onClick={() => handleMark(a.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", sevColor[a.severity] || "")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium truncate">{a.title}</p>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1">{a.kind}</Badge>
                        </div>
                        {a.body && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{a.body}</p>}
                        {a.track_key && <p className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">{a.track_key}</p>}
                        <p className="text-[9px] text-muted-foreground/60 mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[9px] opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleDismiss(a.id); }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};