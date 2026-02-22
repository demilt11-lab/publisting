import { useState, useCallback, useEffect } from "react";
import { Briefcase, Download, Trash2, Plus, X, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type DealStatus = "Researching" | "Outreach" | "Negotiating" | "Signed" | "Passed";

export interface Deal {
  id: string;
  songTitle: string;
  artist: string;
  publisher: string;
  status: DealStatus;
  notes: string;
  dateAdded: string;
}

const STORAGE_KEY = "pubcheck-deals";

const STATUS_COLORS: Record<DealStatus, string> = {
  Researching: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Outreach: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  Negotiating: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  Signed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Passed: "bg-red-500/15 text-red-400 border-red-500/25",
};

function loadDeals(): Deal[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}
function saveDeals(d: Deal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>(loadDeals);

  const addDeal = useCallback((songTitle: string, artist: string, publisher?: string) => {
    setDeals(prev => {
      if (prev.some(d => d.songTitle === songTitle && d.artist === artist)) return prev;
      const updated = [...prev, {
        id: crypto.randomUUID(),
        songTitle, artist, publisher: publisher || "",
        status: "Researching" as DealStatus,
        notes: "",
        dateAdded: new Date().toISOString(),
      }];
      saveDeals(updated);
      return updated;
    });
  }, []);

  const updateDeal = useCallback((id: string, patch: Partial<Deal>) => {
    setDeals(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, ...patch } : d);
      saveDeals(updated);
      return updated;
    });
  }, []);

  const removeDeal = useCallback((id: string) => {
    setDeals(prev => {
      const updated = prev.filter(d => d.id !== id);
      saveDeals(updated);
      return updated;
    });
  }, []);

  return { deals, addDeal, updateDeal, removeDeal };
}

interface DealsTrackerProps {
  deals: Deal[];
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  removeDeal: (id: string) => void;
}

export const DealsTracker = ({ deals, updateDeal, removeDeal }: DealsTrackerProps) => {
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);

  const exportCSV = useCallback(() => {
    const headers = ["Song", "Artist", "Publisher", "Status", "Notes", "Date Added"];
    const rows = deals.map(d => [d.songTitle, d.artist, d.publisher, d.status, d.notes, new Date(d.dateAdded).toLocaleDateString()]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deals.csv";
    a.click();
  }, [deals]);

  const activeCount = deals.filter(d => d.status !== "Signed" && d.status !== "Passed").length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative gap-1.5">
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Deals</span>
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Track deals</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" /> Deals Tracker
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {deals.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No deals yet. Click "+ Add to Deals" on any song card to start tracking.
            </p>
          )}

          {deals.length > 0 && (
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </div>
          )}

          {deals.map(deal => (
            <div key={deal.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{deal.songTitle}</p>
                  <p className="text-xs text-muted-foreground truncate">{deal.artist}</p>
                  {deal.publisher && <p className="text-xs text-primary mt-0.5">{deal.publisher}</p>}
                </div>
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeDeal(deal.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Select value={deal.status} onValueChange={(v) => updateDeal(deal.id, { status: v as DealStatus })}>
                  <SelectTrigger className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Researching", "Outreach", "Negotiating", "Signed", "Passed"] as DealStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[deal.status]}`}>
                  {deal.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(deal.dateAdded).toLocaleDateString()}
                </span>
              </div>

              {editingNotes === deal.id ? (
                <div className="space-y-1">
                  <Textarea
                    value={deal.notes}
                    onChange={(e) => updateDeal(deal.id, { notes: e.target.value })}
                    rows={2}
                    placeholder="Add notes..."
                    className="text-xs"
                  />
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setEditingNotes(null)}>Done</Button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNotes(deal.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <StickyNote className="w-3 h-3" />
                  {deal.notes ? deal.notes.slice(0, 50) + (deal.notes.length > 50 ? "..." : "") : "Add notes..."}
                </button>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
