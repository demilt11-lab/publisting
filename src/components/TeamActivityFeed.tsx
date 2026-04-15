import { User, Search, Plus, ArrowRight, MessageSquare, Star, AtSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTeamActivityFeed } from "@/hooks/useTeamActivityFeed";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<string, typeof User> = {
  search: Search,
  watchlist_add: Plus,
  pipeline_move: ArrowRight,
  note_added: MessageSquare,
  priority_toggle: Star,
  mention: AtSign,
};

const ACTION_LABELS: Record<string, string> = {
  search: "searched for",
  watchlist_add: "added to watchlist",
  pipeline_move: "moved",
  note_added: "added a note on",
  priority_toggle: "flagged",
  mention: "mentioned you in",
  competitor_signing: "tracked competitor signing",
  assignment: "assigned",
};

interface TeamActivityFeedProps {
  compact?: boolean;
}

export const TeamActivityFeed = ({ compact = false }: TeamActivityFeedProps) => {
  const { activities, myMentions, getMemberName } = useTeamActivityFeed();

  if (activities.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No team activity yet.</p>
      </div>
    );
  }

  const displayed = compact ? activities.slice(0, 10) : activities;

  return (
    <div className="space-y-3">
      {myMentions.length > 0 && (
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
            <AtSign className="w-3 h-3" />
            {myMentions.length} unread mention{myMentions.length > 1 ? "s" : ""}
          </div>
        </div>
      )}

      <ScrollArea className={cn("pr-2", compact ? "max-h-[250px]" : "max-h-[500px]")}>
        <div className="space-y-1.5">
          {displayed.map(activity => {
            const Icon = ACTION_ICONS[activity.action_type] || User;
            const label = ACTION_LABELS[activity.action_type] || activity.action_type;
            return (
              <div key={activity.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-elevated/50 transition-colors">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    <span className="font-medium">{getMemberName(activity.actor_id)}</span>
                    {" "}{label}{" "}
                    {activity.target_name && <span className="font-medium text-primary">{activity.target_name}</span>}
                  </p>
                  {activity.details?.note && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">"{activity.details.note}"</p>
                  )}
                  {activity.details?.from_status && activity.details?.to_status && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[9px] h-4">{activity.details.from_status}</Badge>
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                      <Badge variant="outline" className="text-[9px] h-4">{activity.details.to_status}</Badge>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
