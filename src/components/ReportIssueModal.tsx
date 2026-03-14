import { useState, forwardRef } from "react";
import { Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ISSUE_OPTIONS = [
  { id: "credits", label: "Credits are incorrect or incomplete" },
  { id: "signing", label: "Signing status is wrong (signed vs unsigned)" },
  { id: "contacts", label: "Contacts are wrong/out of date" },
  { id: "exposure", label: "Chart/playlist/radio data looks wrong" },
  { id: "other", label: "Other" },
] as const;

interface ReportIssueModalProps {
  songTitle: string;
  songArtist: string;
  personName?: string;
  module?: string;
}

export const ReportIssueModal = forwardRef<HTMLDivElement, ReportIssueModalProps>(function ReportIssueModal({ songTitle, songArtist, personName, module }, _ref) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) {
        toast({ title: "Sign in required", description: "Please sign in to report an issue.", variant: "destructive" });
        return;
      }
      // Use .from() with explicit typing workaround for new table
      const { error } = await (supabase as any).from("data_issues").insert({
        user_id: userId,
        song_title: songTitle,
        song_artist: songArtist,
        person_name: personName || null,
        module: module || null,
        issue_types: selected,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Thanks — we've logged this issue for review." });
      setOpen(false);
      setSelected([]);
      setComment("");
    } catch (e) {
      console.error("Report issue error:", e);
      toast({ title: "Failed to submit", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <Flag className="w-3 h-3" />
          Report an issue
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Report an issue with this data</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {songTitle} — {songArtist}
        </p>
        <div className="space-y-2 mt-2">
          <p className="text-xs font-medium text-foreground">What's wrong?</p>
          {ISSUE_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={selected.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
              <span className="text-xs text-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
        {selected.includes("other") && (
          <Textarea
            placeholder="Describe the issue…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mt-2 text-xs h-20"
          />
        )}
        {!selected.includes("other") && (
          <Textarea
            placeholder="Optional comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mt-2 text-xs h-16"
          />
        )}
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={selected.length === 0 || submitting} onClick={handleSubmit}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
