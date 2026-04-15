import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTeamContext } from "@/contexts/TeamContext";

export interface ActivityFeedItem {
  id: string;
  team_id: string;
  actor_id: string;
  action_type: string;
  target_type: string | null;
  target_name: string | null;
  target_id: string | null;
  details: Record<string, any>;
  mentions: string[];
  created_at: string;
}

export const useTeamActivityFeed = () => {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { activeTeam, members } = useTeamContext();

  const fetchActivities = useCallback(async () => {
    if (!activeTeam) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("team_activity_feed")
      .select("*")
      .eq("team_id", activeTeam.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setActivities(data as ActivityFeedItem[]);
    setIsLoading(false);
  }, [activeTeam]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Realtime subscription
  useEffect(() => {
    if (!activeTeam) return;
    const channel = supabase
      .channel(`team-activity-${activeTeam.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "team_activity_feed",
        filter: `team_id=eq.${activeTeam.id}`,
      }, (payload) => {
        setActivities(prev => [payload.new as ActivityFeedItem, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTeam]);

  const logActivity = async (
    actionType: string,
    targetType?: string,
    targetName?: string,
    targetId?: string,
    details?: Record<string, any>,
    mentions?: string[]
  ) => {
    if (!user || !activeTeam) return;
    await supabase.from("team_activity_feed").insert({
      team_id: activeTeam.id,
      actor_id: user.id,
      action_type: actionType,
      target_type: targetType || null,
      target_name: targetName || null,
      target_id: targetId || null,
      details: details || {},
      mentions: mentions || [],
    });
  };

  const getMemberName = (userId: string) => {
    const member = members.find(m => m.user_id === userId);
    return member?.invited_email || userId.slice(0, 8);
  };

  const myMentions = activities.filter(a => user && a.mentions.includes(user.id));

  return { activities, myMentions, isLoading, logActivity, getMemberName, refresh: fetchActivities };
};
