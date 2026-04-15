import { useState, useEffect, useMemo } from "react";
import { Bell, RefreshCw, Zap, TrendingUp, DollarSign, CheckCircle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const TIMESTAMPS_KEY = "publisting-last-checked";
const STALE_MS = 24 * 60 * 60 * 1000;

interface FavSong { name: string; role: string; }

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: any;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  favorites: FavSong[];
  onRecheck: (name: string) => void;
}

function loadTimestamps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TIMESTAMPS_KEY) || "{}"); } catch { return {}; }
}
function saveTimestamp(name: string) {
  const ts = loadTimestamps();
  ts[name] = Date.now();
  localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(ts));
}

const typeIcons: Record<string, any> = {
  trend_alert: Zap,
  deal_action: TrendingUp,
  valuation_update: DollarSign,
};

const typeColors: Record<string, string> = {
  trend_alert: "text-orange-400",
  deal_action: "text-blue-400",
  valuation_update: "text-emerald-400",
};

export const NotificationBell = ({ favorites, onRecheck }: NotificationBellProps) => {
  const [timestamps, setTimestamps] = useState(loadTimestamps);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  // Load DB notifications
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setNotifications(data as any);
    };
    load();

    // Realtime subscription
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        setNotifications(prev => [payload.new as any, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const staleFavs = useMemo(() => {
    if (!favorites || favorites.length === 0) return [];
    const now = Date.now();
    return favorites.filter(f => {
      const last = timestamps[f.name];
      return !last || (now - last) > STALE_MS;
    });
  }, [favorites, timestamps]);

  const unreadCount = notifications.filter(n => !n.is_read).length + staleFavs.length;

  const handleRecheck = (name: string) => {
    saveTimestamp(name);
    setTimestamps(loadTimestamps());
    onRecheck(name);
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications" as any).update({ is_read: true } as any).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      for (const id of unreadIds) {
        await supabase.from("notifications" as any).update({ is_read: true } as any).eq("id", id);
      }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications" as any).delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9 relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <p className="text-xs font-semibold">Notifications</p>
          {notifications.some(n => !n.is_read) && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={markAllRead}>
              <CheckCircle className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="divide-y divide-border/30">
            {/* DB notifications */}
            {notifications.map(n => {
              const Icon = typeIcons[n.type] || Bell;
              const color = typeColors[n.type] || "text-muted-foreground";
              return (
                <div
                  key={n.id}
                  className={cn("px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer", !n.is_read && "bg-primary/5")}
                  onClick={() => markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium truncate", !n.is_read && "text-foreground")}>{n.title}</p>
                      {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatTime(n.created_at)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Stale favorites */}
            {staleFavs.map(f => (
              <div key={f.name} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-foreground truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">Needs refresh</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0" onClick={() => handleRecheck(f.name)}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Re-check
                </Button>
              </div>
            ))}

            {notifications.length === 0 && staleFavs.length === 0 && (
              <div className="px-3 py-6 text-center">
                <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
