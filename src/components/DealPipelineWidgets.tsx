import { useState, useCallback } from "react";
import { MessageSquare, Phone, Mail, Calendar, FileText, Send, Clock, TrendingUp, AlertCircle, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchDealScore, logPipelineActivity, getPipelineActivities, getLatestDealScore } from "@/lib/api/phase1Engines";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";

interface DealScoreBadgeProps {
  entryId: string;
  teamId: string;
  compact?: boolean;
}

export function DealScoreBadge({ entryId, teamId, compact = false }: DealScoreBadgeProps) {
  const [score, setScore] = useState<any>(null);

  useEffect(() => {
    if (!entryId) return;
    getLatestDealScore(entryId).then(s => {
      if (s) setScore(s);
    }).catch(() => {});
  }, [entryId]);

  if (!score) return null;

  const value = score.score;
  const color = value >= 75 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : value >= 40 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-red-400 border-red-500/30 bg-red-500/10";

  const emoji = value >= 75 ? "🟢" : value >= 40 ? "🟡" : "🔴";

  if (compact) {
    return (
      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 gap-0.5", color)}>
        {emoji} {value}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1", color)}>
      {emoji} Deal Score: {value}/100
    </Badge>
  );
}

// Suggested Action Card
interface SuggestedActionCardProps {
  entryId: string;
  teamId: string;
  personName: string;
  onActionTaken?: () => void;
}

export function SuggestedActionCard({ entryId, teamId, personName, onActionTaken }: SuggestedActionCardProps) {
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!entryId) return;
    getLatestDealScore(entryId).then(s => { if (s) setScore(s); }).catch(() => {});
  }, [entryId]);

  const runScoring = async () => {
    setLoading(true);
    try {
      const result = await fetchDealScore(entryId, teamId);
      setScore(result.score);
    } catch {
      toast({ title: "Failed to calculate deal score", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!score) {
    return (
      <Button size="sm" variant="outline" onClick={runScoring} disabled={loading} className="h-7 text-xs">
        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
        Score Deal
      </Button>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <DealScoreBadge entryId={entryId} teamId={teamId} />
          <Button size="sm" variant="ghost" onClick={runScoring} disabled={loading} className="h-6 text-[10px]">
            {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Refresh"}
          </Button>
        </div>
        {score.suggested_action && (
          <div className="flex items-start gap-2 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">{score.suggested_action}</p>
          </div>
        )}
        {score.next_best_action_date && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            Next action: {new Date(score.next_best_action_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Activity Timeline
interface ActivityTimelineProps {
  entryId: string;
  teamId: string;
}

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  email_sent: Mail,
  call_made: Phone,
  meeting_scheduled: Calendar,
  contract_sent: FileText,
  response_received: MessageSquare,
  note_added: MessageSquare,
};

const ACTIVITY_LABELS: Record<string, string> = {
  email_sent: "Email sent",
  call_made: "Call made",
  meeting_scheduled: "Meeting scheduled",
  contract_sent: "Contract sent",
  response_received: "Response received",
  note_added: "Note added",
};

export function ActivityTimeline({ entryId, teamId }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activityType, setActivityType] = useState("email_sent");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const loadActivities = useCallback(async () => {
    const data = await getPipelineActivities(entryId);
    setActivities(data);
  }, [entryId]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const handleAdd = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await logPipelineActivity(entryId, teamId, activityType, { note: details }, user.id);
      toast({ title: "Activity logged" });
      setDetails("");
      setShowAddDialog(false);
      loadActivities();
    } catch {
      toast({ title: "Failed to log activity", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Pipeline Activity</p>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1">
              <Plus className="w-2.5 h-2.5" /> Log
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Log Pipeline Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Details..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
              />
              <Button onClick={handleAdd} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                Log Activity
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="max-h-40">
        <div className="space-y-1.5">
          {activities.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No activities yet</p>
          )}
          {activities.map((a) => {
            const Icon = ACTIVITY_ICONS[a.activity_type] || MessageSquare;
            return (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <Icon className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{ACTIVITY_LABELS[a.activity_type] || a.activity_type}</span>
                  {a.details?.note && <span className="text-muted-foreground"> — {a.details.note}</span>}
                </div>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// Email Templates
export const EMAIL_TEMPLATES = {
  initial_outreach: {
    label: "Initial Outreach",
    subject: "Publishing opportunity — {{artist_name}}",
    body: `Hi {{artist_name}},

I've been following your work and I'm impressed by your recent output{{recent_streams ? ', including ' + recent_streams + ' streams across platforms' : ''}}.

I'd love to discuss how we could support your publishing catalog and help maximize your royalty income{{trending_region ? ', particularly with your growing audience in ' + trending_region : ''}}.

Would you be open to a brief call this week?

Best regards`,
  },
  follow_up_1: {
    label: "Follow-up #1",
    subject: "Re: Publishing opportunity — {{artist_name}}",
    body: `Hi {{artist_name}},

I wanted to follow up on my earlier message. I know things get busy, but I genuinely believe there's an opportunity to grow your publishing income significantly.

Happy to share some specific ideas if you're interested.

Best`,
  },
  follow_up_2: {
    label: "Follow-up #2",
    subject: "Final follow-up — {{artist_name}}",
    body: `Hi {{artist_name}},

Just circling back one last time. I don't want to be a nuisance, but I wanted to make sure you saw my earlier messages about a publishing opportunity.

If the timing isn't right, no worries at all. Feel free to reach out whenever you'd like to chat.

All the best`,
  },
  meeting_confirmation: {
    label: "Meeting Confirmation",
    subject: "Confirmed: Call on {{date}} — {{artist_name}}",
    body: `Hi {{artist_name}},

Great speaking with you! This confirms our call for {{date}}.

I'll prepare some analysis on your catalog's potential and come with specific numbers.

Looking forward to it.`,
  },
};
