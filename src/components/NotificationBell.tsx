import { useState, useEffect, useMemo } from "react";
import { Bell, RefreshCw, Zap, TrendingUp, DollarSign, CheckCircle, X, Filter, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const typeLabels: Record<string, string> = {
  trend_alert: "Trends",
  deal_action: "Pipeline",
  valuation_update: "Valuation",
};

export const NotificationBell = ({ favorites, onRecheck }: NotificationBellProps) => {
  const [timestamps, setTimestamps] = useState(loadTimestamps);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setNotifications(data as any);
    };
    load();

    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        setNotifications(prev => [payload.new as any, ...prev].slice(0, 50));
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

  const filteredNotifications = useMemo(() => {
    if (activeTab === "all") return notifications;
    return notifications.filter(n => n.type === activeTab);
  }, [notifications, activeTab]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

    const todayItems: Notification[] = [];
    const yesterdayItems: Notification[] = [];
    const olderItems: Notification[] = [];

    filteredNotifications.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today) todayItems.push(n);
      else if (d >= yesterday) yesterdayItems.push(n);
      else olderItems.push(n);
    });

    if (todayItems.length) groups.push({ label: "Today", items: todayItems });
    if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
    if (olderItems.length) groups.push({ label: "Earlier", items: olderItems });
    return groups;
  }, [filteredNotifications]);

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

  // Type counts for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.filter(n => !n.is_read).forEach(n => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }, [notifications]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9 relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center px-0.5 animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <p className="text-xs font-semibold">Notifications</p>
          <div className="flex gap-1">
            {notifications.some(n => !n.is_read) && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={markAllRead}>
                <CheckCircle className="w-3 h-3 mr-1" /> Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-3 pt-2 pb-1 flex gap-1 flex-wrap">
          <Button variant={activeTab === "all" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setActiveTab("all")}>
            All {unreadCount > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1 h-3.5">{unreadCount}</Badge>}
          </Button>
          {Object.entries(typeLabels).map(([type, label]) => (
            <Button key={type} variant={activeTab === type ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setActiveTab(type)}>
              {label}
              {(typeCounts[type] || 0) > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1 h-3.5">{typeCounts[type]}</Badge>}
            </Button>
          ))}
        </div>

        <ScrollArea className="max-h-96">
          <div>
            {grouped.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 bg-muted/20 sticky top-0">{group.label}</p>
                {group.items.map(n => {
                  const Icon = typeIcons[n.type] || Bell;
                  const color = typeColors[n.type] || "text-muted-foreground";
                  return (
                    <div
                      key={n.id}
                      className={cn("px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer group", !n.is_read && "bg-primary/5")}
                      onClick={() => markRead(n.id)}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-medium truncate", !n.is_read && "text-foreground")}>{n.title}</p>
                          {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-muted-foreground/60">{formatTime(n.created_at)}</p>
                            {n.metadata?.auto_advance && (
                              <Badge variant="outline" className="text-[8px] px-1 h-3.5 border-primary/30 text-primary">
                                <ArrowUpRight className="w-2 h-2 mr-0.5" />Auto
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Stale favorites */}
            {activeTab === "all" && staleFavs.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 bg-muted/20">Needs Refresh</p>
                {staleFavs.map(f => (
                  <div key={f.name} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-foreground truncate">{f.name}</p>
                      <p className="text-[10px] text-muted-foreground">Credit data may be stale</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0" onClick={() => handleRecheck(f.name)}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Re-check
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {filteredNotifications.length === 0 && staleFavs.length === 0 && (
              <div className="px-3 py-8 text-center">
                <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Trend alerts and pipeline actions will appear here</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};