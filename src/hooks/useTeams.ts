import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "owner" | "member";
  invited_email?: string;
  joined_at: string;
}

export interface TeamFavorite {
  id: string;
  team_id: string;
  name: string;
  role: "artist" | "writer" | "producer";
  ipi?: string;
  pro?: string;
  publisher?: string;
  added_by: string;
  sort_order: number;
  created_at: string;
}

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  invited_by: string;
  created_at: string;
}

export const useTeams = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamFavorites, setTeamFavorites] = useState<TeamFavorite[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [pendingInvites, setPendingInvites] = useState<(TeamInvite & { teamName?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setTeams(data as Team[]);
    setIsLoading(false);
  }, [user]);

  const fetchPendingInvites = useCallback(async () => {
    if (!user?.email) return;
    const { data } = await supabase
      .from("team_invites")
      .select("*")
      .eq("email", user.email);
    if (data && data.length > 0) {
      // Fetch team names for the invites
      const teamIds = [...new Set(data.map((d: any) => d.team_id))];
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds);
      const teamMap = new Map((teamsData || []).map((t: any) => [t.id, t.name]));
      setPendingInvites(data.map((d: any) => ({ ...d, teamName: teamMap.get(d.team_id) })));
    } else {
      setPendingInvites([]);
    }
  }, [user]);

  const fetchTeamData = useCallback(async (teamId: string) => {
    const [membersRes, favRes, invitesRes] = await Promise.all([
      supabase.from("team_members").select("*").eq("team_id", teamId),
      supabase.from("team_favorites").select("*").eq("team_id", teamId).order("sort_order"),
      supabase.from("team_invites").select("*").eq("team_id", teamId),
    ]);
    if (membersRes.data) setMembers(membersRes.data as TeamMember[]);
    if (favRes.data) setTeamFavorites(favRes.data as TeamFavorite[]);
    if (invitesRes.data) setInvites(invitesRes.data as TeamInvite[]);
  }, []);

  useEffect(() => {
    fetchTeams();
    fetchPendingInvites();
  }, [fetchTeams, fetchPendingInvites]);

  useEffect(() => {
    if (activeTeam) fetchTeamData(activeTeam.id);
  }, [activeTeam, fetchTeamData]);

  const createTeam = async (name: string) => {
    if (!user) return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) {
      toast({ title: "Invalid name", description: "Team name must be 1-100 characters.", variant: "destructive" });
      return null;
    }
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: trimmed, created_by: user.id })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: "Failed to create team.", variant: "destructive" });
      return null;
    }
    // Owner membership is auto-added by database trigger
    toast({ title: "Team created", description: `"${trimmed}" is ready.` });
    await fetchTeams();
    return data as Team;
  };

  const deleteTeam = async (teamId: string) => {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete team.", variant: "destructive" });
      return;
    }
    if (activeTeam?.id === teamId) {
      setActiveTeam(null);
      setMembers([]);
      setTeamFavorites([]);
      setInvites([]);
    }
    await fetchTeams();
    toast({ title: "Team deleted" });
  };

  const inviteMember = async (teamId: string, email: string) => {
    if (!user) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("team_invites").insert({
      team_id: teamId,
      email: trimmed,
      invited_by: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already invited", description: `${trimmed} already has a pending invite.` });
      } else {
        toast({ title: "Error", description: "Failed to send invite.", variant: "destructive" });
      }
      return;
    }
    toast({ title: "Invite sent", description: `${trimmed} can now join your team.` });
    if (activeTeam?.id === teamId) fetchTeamData(teamId);
  };

  const acceptInvite = async (invite: TeamInvite) => {
    if (!user) return;
    // Add as member
    const { error } = await supabase.from("team_members").insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: "member",
      invited_email: invite.email,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to join team.", variant: "destructive" });
      return;
    }
    // Remove invite
    await supabase.from("team_invites").delete().eq("id", invite.id);
    toast({ title: "Joined team!" });
    await Promise.all([fetchTeams(), fetchPendingInvites()]);
  };

  const removeMember = async (memberId: string) => {
    await supabase.from("team_members").delete().eq("id", memberId);
    if (activeTeam) fetchTeamData(activeTeam.id);
  };

  const addTeamFavorite = async (
    teamId: string,
    name: string,
    role: "artist" | "writer" | "producer",
    ipi?: string,
    pro?: string,
    publisher?: string
  ) => {
    if (!user) return;
    const { error } = await supabase.from("team_favorites").insert({
      team_id: teamId,
      name,
      role,
      ipi,
      pro,
      publisher,
      added_by: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already in team list", description: `${name} is already in the shared list.` });
      } else {
        toast({ title: "Error", description: "Failed to add to team.", variant: "destructive" });
      }
      return;
    }
    toast({ title: "Added to team list", description: `${name} added to shared favorites.` });
    if (activeTeam?.id === teamId) fetchTeamData(teamId);
  };

  const removeTeamFavorite = async (favId: string) => {
    await supabase.from("team_favorites").delete().eq("id", favId);
    if (activeTeam) fetchTeamData(activeTeam.id);
  };

  const reorderTeamFavorites = async (reordered: TeamFavorite[]) => {
    setTeamFavorites(reordered);
    const updates = reordered.map((f, i) =>
      supabase.from("team_favorites").update({ sort_order: i }).eq("id", f.id)
    );
    await Promise.all(updates);
  };

  const isTeamFavorite = (teamId: string, name: string, role: string) => {
    return teamFavorites.some(f => f.team_id === teamId && f.name === name && f.role === role);
  };

  return {
    teams,
    activeTeam,
    setActiveTeam,
    members,
    teamFavorites,
    invites,
    pendingInvites,
    isLoading,
    createTeam,
    deleteTeam,
    inviteMember,
    acceptInvite,
    removeMember,
    addTeamFavorite,
    removeTeamFavorite,
    reorderTeamFavorites,
    isTeamFavorite,
    refreshTeamData: () => activeTeam && fetchTeamData(activeTeam.id),
  };
};
