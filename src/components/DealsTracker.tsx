import { useState, useCallback, useMemo } from "react";
import { Briefcase, Download, Trash2, StickyNote, ArrowUpDown, Filter, Mail, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export type DealStatus = "Researching" | "Outreach" | "Negotiating" | "Signed" | "Passed";
export type DealPriority = "High" | "Medium" | "Low";

export interface Deal {
  id: string;
  songTitle: string;
  artist: string;
  publisher: string;
  status: DealStatus;
  priority: DealPriority;
  dealValue: number | null;
  contact: string;
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

const PRIORITY_COLORS: Record<DealPriority, string> = {
  High: "bg-destructive/15 text-destructive border-destructive/25",
  Medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

function loadDeals(): Deal[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    // migrate old deals without priority/dealValue
    return raw.map((d: any) => ({
      ...d,
      priority: d.priority || "Medium",
      dealValue: d.dealValue ?? null,
      contact: d.contact || "",
    }));
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
        priority: "Medium" as DealPriority,
        dealValue: null,
        contact: "",
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

type SortKey = "date" | "status" | "priority";
const STATUS_ORDER: DealStatus[] = ["Researching", "Outreach", "Negotiating", "Signed", "Passed"];
const PRIORITY_ORDER: DealPriority[] = ["High", "Medium", "Low"];

interface DealsTrackerProps {
  deals: Deal[];
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  removeDeal: (id: string) => void;
  openWithPrefill?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const DealsTracker = ({ deals, updateDeal, removeDeal, openWithPrefill, onOpenChange }: DealsTrackerProps) => {
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [filterStatus, setFilterStatus] = useState<DealStatus | "All">("All");
  const { toast } = useToast();

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };

  // Open externally
  if (openWithPrefill && !open) {
    setOpen(true);
  }

  const filtered = useMemo(() => {
    let list = filterStatus === "All" ? deals : deals.filter(d => d.status === filterStatus);
    list = [...list].sort((a, b) => {
      if (sortBy === "status") return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (sortBy === "priority") return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });
    return list;
  }, [deals, filterStatus, sortBy]);

  const exportCSV = useCallback(() => {
    const headers = ["Song", "Artist", "Publisher", "Status", "Priority", "Deal Value", "Contact", "Notes", "Date Added"];
    const rows = deals.map(d => [
      d.songTitle, d.artist, d.publisher, d.status, d.priority,
      d.dealValue != null ? `$${d.dealValue.toLocaleString()}` : "",
      d.contact || "",
      d.notes, new Date(d.dateAdded).toLocaleDateString()
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deals.csv";
    a.click();
  }, [deals]);

  const generateEmailDraft = useCallback((deal: Deal) => {
    const contactName = deal.contact ? deal.contact.split(/[@\s]/)[0] : "there";
    const email = `Hi ${contactName},\n\nI'm reaching out regarding the publishing rights for "${deal.songTitle}" by ${deal.artist}.\n\n${deal.publisher ? `I understand the work is published through ${deal.publisher}. ` : ""}I'd love to discuss potential sync licensing opportunities for this track.\n\nCould we schedule a brief call to discuss?\n\nBest regards`;
    navigator.clipboard.writeText(email);
    return email;
  }, []);

  const activeCount = deals.filter(d => d.status !== "Signed" && d.status !== "Passed").length;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
              No deals yet. Click "+ Deal" on any song card to start tracking.
            </p>
          )}

          {deals.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as DealStatus | "All")}>
                <SelectTrigger className="h-7 w-auto text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-7 w-auto text-xs">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={exportCSV} className="h-7 text-xs">
                  <Download className="w-3 h-3 mr-1" /> CSV
                </Button>
              </div>
            </div>
          )}

          {filtered.map(deal => (
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

              {/* Deal Stage Timeline */}
              <div className="flex items-center gap-0.5">
                {STATUS_ORDER.map((stage, i) => {
                  const current = STATUS_ORDER.indexOf(deal.status);
                  const isActive = i <= current;
                  const isCurrent = i === current;
                  return (
                    <div key={stage} className="flex items-center flex-1">
                      <div className={`h-1.5 w-full rounded-full transition-colors ${
                        isActive ? (deal.status === "Passed" ? "bg-destructive/50" : "bg-primary/60") : "bg-muted"
                      } ${isCurrent ? "ring-1 ring-primary/30" : ""}`} title={stage} />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Select value={deal.status} onValueChange={(v) => updateDeal(deal.id, { status: v as DealStatus })}>
                  <SelectTrigger className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[deal.status]}`}>
                  {deal.status}
                </Badge>
                <Select value={deal.priority} onValueChange={(v) => updateDeal(deal.id, { priority: v as DealPriority })}>
                  <SelectTrigger className="h-6 w-auto text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[deal.priority]}`}>
                  {deal.priority}
                </Badge>
              </div>

              {/* Deal Value */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Deal value ($)"
                  value={deal.dealValue ?? ""}
                  onChange={(e) => updateDeal(deal.id, { dealValue: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 text-xs w-32"
                />
                {deal.dealValue != null && deal.dealValue > 0 && (
                  <span className="text-xs font-medium text-primary">${deal.dealValue.toLocaleString()}</span>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(deal.dateAdded).toLocaleDateString()}
                </span>
              </div>

              {/* Contact field */}
              <Input
                placeholder="Contact name or email..."
                value={deal.contact || ""}
                onChange={(e) => updateDeal(deal.id, { contact: e.target.value })}
                className="h-7 text-xs"
              />

              {/* Notes */}
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

              {/* Email Draft button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => {
                  generateEmailDraft(deal);
                  toast({ title: "Email draft copied!", description: "Professional outreach template copied to clipboard." });
                }}
              >
                <Mail className="w-3 h-3" /> Draft Email
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
