import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamContext } from "@/contexts/TeamContext";
import { useAuth } from "./useAuth";

export type WatchlistEntityType = "writer" | "producer" | "artist" | "publisher" | "label";
export type ContactStatus = "not_contacted" | "reached_out" | "in_talks" | "signed" | "passed";

export const CONTACT_STATUS_CONFIG: Record<ContactStatus, { label: string; color: string }> = {
  not_contacted: { label: "Not Contacted", color: "bg-muted text-muted-foreground border-border" },
  reached_out: { label: "Reached Out", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  in_talks: { label: "In Talks", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  signed: { label: "Signed", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  passed: { label: "Passed", color: "bg-red-500/15 text-red-400 border-red-500/25" },
};

export interface WatchlistSource {
  id: string;
  songTitle: string;
  artist: string;
  addedAt: string;
}

export interface WatchlistEntry {
  id: string;
  teamId: string;
  name: string;
  type: WatchlistEntityType;
  pro?: string;
  ipi?: string;
  isMajor?: boolean;
  socialLinks?: Record<string, string>;
  sources: WatchlistSource[];
  createdAt: string;
  updatedAt: string;
  contactStatus: ContactStatus;
  contactNotes?: string;
  assignedToUserId?: string;
  assignedToEmail?: string;
  createdBy: string;
}

export interface WatchlistActivityEntry {
  id: string;
  entryId: string;
  teamId: string;
  userId: string;
  userEmail?: string;
  activityType: "status_change" | "assignment_change" | "interaction" | "note_change" | "created";
  details: Record<string, any>;
  createdAt: string;
}

const normalizeText = (value: string) => value.trim().toLowerCase();

export function useTeamWatchlist() {
  const { activeTeam, members } = useTeamContext();
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [activity, setActivity] = useState<WatchlistActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const teamId = activeTeam?.id;

  // Fetch watchlist entries for active team
  const fetchWatchlist = useCallback(async () => {
    if (!teamId || !user) { setWatchlist([]); return; }
    setIsLoading(true);
    
    const { data: entries, error } = await supabase
      .from("watchlist_entries")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error || !entries) {
      setIsLoading(false);
      return;
    }

    // Fetch sources for all entries
    const entryIds = entries.map((e: any) => e.id);
    let sourcesData: any[] = [];
    if (entryIds.length > 0) {
      const { data: srcs } = await supabase
        .from("watchlist_entry_sources")
        .select("*")
        .in("entry_id", entryIds);
      sourcesData = srcs || [];
    }

    // Map member emails for assignee display
    const memberMap = new Map(members.map(m => [m.user_id, m.invited_email || m.user_id.slice(0, 8)]));

    const mapped: WatchlistEntry[] = entries.map((e: any) => ({
      id: e.id,
      teamId: e.team_id,
      name: e.person_name,
      type: e.person_type as WatchlistEntityType,
      pro: e.pro || undefined,
      ipi: e.ipi || undefined,
      isMajor: e.is_major ?? undefined,
      socialLinks: e.social_links || undefined,
      sources: sourcesData
        .filter((s: any) => s.entry_id === e.id)
        .map((s: any) => ({ id: s.id, songTitle: s.song_title, artist: s.artist, addedAt: s.added_at })),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      contactStatus: (e.pipeline_status || "not_contacted") as ContactStatus,
      contactNotes: e.contact_notes || undefined,
      assignedToUserId: e.assigned_to_user_id || undefined,
      assignedToEmail: e.assigned_to_user_id ? memberMap.get(e.assigned_to_user_id) : undefined,
      createdBy: e.created_by,
    }));

    setWatchlist(mapped);
    setIsLoading(false);
  }, [teamId, user, members]);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  // Add to watchlist
  const addToWatchlist = useCallback(async (
    name: string,
    type: WatchlistEntityType,
    source: { songTitle: string; artist: string },
    options?: { pro?: string; ipi?: string; isMajor?: boolean; socialLinks?: Record<string, string> }
  ) => {
    if (!teamId || !user) return;

    const cleanName = name.trim();
    const cleanSongTitle = source.songTitle.trim();
    const cleanArtist = source.artist.trim();

    const addSourceIfMissing = async (entryId: string, knownSources?: WatchlistSource[]) => {
      const alreadyInKnownSources = knownSources?.some(
        (s) => normalizeText(s.songTitle) === normalizeText(cleanSongTitle) && normalizeText(s.artist) === normalizeText(cleanArtist)
      );

      if (!alreadyInKnownSources) {
        const { data: existingSource } = await supabase
          .from("watchlist_entry_sources")
          .select("id")
          .eq("entry_id", entryId)
          .ilike("song_title", cleanSongTitle)
          .ilike("artist", cleanArtist)
          .maybeSingle();

        if (!existingSource) {
          await supabase.from("watchlist_entry_sources").insert({
            entry_id: entryId,
            song_title: cleanSongTitle,
            artist: cleanArtist,
          });
        }
      }

      await supabase
        .from("watchlist_entries")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", entryId);
    };

    // First check local state for snappy behavior
    const existing = watchlist.find(
      (e) => normalizeText(e.name) === normalizeText(cleanName) && e.type === type
    );

    if (existing) {
      await addSourceIfMissing(existing.id, existing.sources);
      await fetchWatchlist();
      return;
    }

    // Create new entry
    const { data: newEntry, error } = await supabase
      .from("watchlist_entries")
      .insert({
        team_id: teamId,
        person_name: cleanName,
        person_type: type,
        pro: options?.pro || null,
        ipi: options?.ipi || null,
        is_major: options?.isMajor ?? null,
        pipeline_status: "not_contacted",
        created_by: user.id,
      })
      .select()
      .single();

    // If someone else added in parallel, recover and attach source instead of silently failing
    if (error && error.code === "23505") {
      const { data: existingEntry } = await supabase
        .from("watchlist_entries")
        .select("id")
        .eq("team_id", teamId)
        .eq("person_type", type)
        .ilike("person_name", cleanName)
        .maybeSingle();

      if (existingEntry) {
        await addSourceIfMissing(existingEntry.id);
      }
      await fetchWatchlist();
      return;
    }

    if (error || !newEntry) return;

    // Add source
    await supabase.from("watchlist_entry_sources").insert({
      entry_id: newEntry.id,
      song_title: cleanSongTitle,
      artist: cleanArtist,
    });

    // Log activity
    await supabase.from("watchlist_activity").insert({
      entry_id: newEntry.id,
      team_id: teamId,
      user_id: user.id,
      activity_type: "created",
      details: { person_name: cleanName, person_type: type },
    });

    await fetchWatchlist();
  }, [teamId, user, watchlist, fetchWatchlist]);

  // Remove from watchlist
  const removeFromWatchlist = useCallback(async (id: string) => {
    await supabase.from("watchlist_entries").delete().eq("id", id);
    await fetchWatchlist();
  }, [fetchWatchlist]);

  // Update pipeline status
  const updateContactStatus = useCallback(async (id: string, status: ContactStatus) => {
    if (!teamId || !user) return;
    const entry = watchlist.find(e => e.id === id);
    const oldStatus = entry?.contactStatus || "not_contacted";
    
    await supabase.from("watchlist_entries")
      .update({ pipeline_status: status, updated_at: new Date().toISOString() })
      .eq("id", id);

    await supabase.from("watchlist_activity").insert({
      entry_id: id,
      team_id: teamId,
      user_id: user.id,
      activity_type: "status_change",
      details: { from: oldStatus, to: status },
    });

    await fetchWatchlist();
  }, [teamId, user, watchlist, fetchWatchlist]);

  // Update notes
  const updateContactNotes = useCallback(async (id: string, notes: string) => {
    if (!teamId || !user) return;
    await supabase.from("watchlist_entries")
      .update({ contact_notes: notes, updated_at: new Date().toISOString() })
      .eq("id", id);

    // Don't log every keystroke — just update
    setWatchlist(prev => prev.map(e => e.id === id ? { ...e, contactNotes: notes } : e));
  }, [teamId, user]);

  // Assign to user
  const assignToUser = useCallback(async (entryId: string, userId: string | null) => {
    if (!teamId || !user) return;
    const entry = watchlist.find(e => e.id === entryId);
    
    await supabase.from("watchlist_entries")
      .update({ assigned_to_user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", entryId);

    const memberMap = new Map(members.map(m => [m.user_id, m.invited_email || m.user_id.slice(0, 8)]));
    await supabase.from("watchlist_activity").insert({
      entry_id: entryId,
      team_id: teamId,
      user_id: user.id,
      activity_type: "assignment_change",
      details: {
        from: entry?.assignedToUserId || null,
        to: userId,
        assigned_name: userId ? memberMap.get(userId) : "Unassigned",
      },
    });

    await fetchWatchlist();
  }, [teamId, user, watchlist, members, fetchWatchlist]);

  // Fetch activity for an entry
  const fetchActivity = useCallback(async (entryId: string) => {
    if (!teamId) return;
    const { data } = await supabase
      .from("watchlist_activity")
      .select("*")
      .eq("entry_id", entryId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      const memberMap = new Map(members.map(m => [m.user_id, m.invited_email || m.user_id.slice(0, 8)]));
      setActivity(data.map((a: any) => ({
        id: a.id,
        entryId: a.entry_id,
        teamId: a.team_id,
        userId: a.user_id,
        userEmail: memberMap.get(a.user_id),
        activityType: a.activity_type,
        details: a.details as Record<string, any>,
        createdAt: a.created_at,
      })));
    }
  }, [teamId, members]);

  // Check if person is in watchlist
  const isInWatchlist = useCallback((name: string, type: WatchlistEntityType): boolean => {
    return watchlist.some(
      e => e.name.toLowerCase() === name.toLowerCase() && e.type === type
    );
  }, [watchlist]);

  const getStats = useCallback(() => {
    const byType: Record<WatchlistEntityType, number> = { writer: 0, producer: 0, artist: 0, publisher: 0, label: 0 };
    let majorCount = 0, indieCount = 0, totalAppearances = 0;
    watchlist.forEach(entry => {
      byType[entry.type]++;
      if (entry.isMajor === true) majorCount++;
      if (entry.isMajor === false) indieCount++;
      totalAppearances += entry.sources.length;
    });
    return { total: watchlist.length, byType, majorCount, indieCount, totalAppearances };
  }, [watchlist]);

  return {
    watchlist,
    activity,
    isLoading,
    addToWatchlist,
    removeFromWatchlist,
    updateContactStatus,
    updateContactNotes,
    assignToUser,
    fetchActivity,
    isInWatchlist,
    getStats,
    refetch: fetchWatchlist,
  };
}
