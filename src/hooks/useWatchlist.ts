import { useState, useCallback, useEffect } from "react";
import { useTeamContext } from "@/contexts/TeamContext";
import { useTeamWatchlist, WatchlistEntry, WatchlistEntityType, ContactStatus, CONTACT_STATUS_CONFIG, WatchlistSource, WatchlistActivityEntry } from "./useTeamWatchlist";
import { useAuth } from "./useAuth";
import { readStorageItem, writeStorageItem } from "@/lib/localStorage";

export type { WatchlistEntry, WatchlistEntityType, ContactStatus, WatchlistSource, WatchlistActivityEntry };
export { CONTACT_STATUS_CONFIG };

const STORAGE_KEYS = ["publisting-watchlist", "pubcheck-watchlist", "qoda-watchlist"] as const;
const STORAGE_KEY = STORAGE_KEYS[0];

interface LocalEntry {
  id: string;
  name: string;
  type: WatchlistEntityType;
  pro?: string;
  ipi?: string;
  isMajor?: boolean;
  socialLinks?: Record<string, string>;
  sources: { songTitle: string; artist: string; addedAt: number }[];
  createdAt: number;
  updatedAt: number;
  contactStatus: ContactStatus;
  contactNotes?: string;
  isPriority: boolean;
}

function loadLocal(): LocalEntry[] {
  try {
    const raw = readStorageItem(STORAGE_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(entries: LocalEntry[]) {
  writeStorageItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useWatchlist() {
  const { user } = useAuth();
  const { activeTeam, members, teams, isLoading: isTeamContextLoading } = useTeamContext();
  const teamWatchlist = useTeamWatchlist();

  const [localList, setLocalList] = useState<LocalEntry[]>(loadLocal);
  useEffect(() => { saveLocal(localList); }, [localList]);

  const isTeamMode = !!(user && activeTeam);
  const shouldUseLocalWatchlist = !user || (!activeTeam && !isTeamContextLoading && teams.length === 0);

  const localAsWatchlist: WatchlistEntry[] = localList.map((e) => ({
    id: e.id,
    teamId: "",
    name: e.name,
    type: e.type,
    pro: e.pro,
    ipi: e.ipi,
    isMajor: e.isMajor,
    socialLinks: e.socialLinks,
    sources: e.sources.map((s, i) => ({
      id: `local-${i}`,
      songTitle: s.songTitle,
      artist: s.artist,
      addedAt: new Date(s.addedAt).toISOString(),
    })),
    createdAt: new Date(e.createdAt).toISOString(),
    updatedAt: new Date(e.updatedAt).toISOString(),
    contactStatus: e.contactStatus,
    contactNotes: e.contactNotes,
    isPriority: e.isPriority ?? false,
    createdBy: "",
  }));

  const watchlist = shouldUseLocalWatchlist ? localAsWatchlist : teamWatchlist.watchlist;

  const addToWatchlist = useCallback((
    name: string,
    type: WatchlistEntityType,
    source: { songTitle: string; artist: string },
    options?: { pro?: string; ipi?: string; isMajor?: boolean; socialLinks?: Record<string, string> }
  ) => {
    if (!shouldUseLocalWatchlist) {
      if (!activeTeam) return;
      void teamWatchlist.addToWatchlist(name, type, source, options);
      return;
    }

    setLocalList((prev) => {
      const idx = prev.findIndex((e) => e.name.toLowerCase() === name.toLowerCase() && e.type === type);
      if (idx >= 0) {
        const updated = [...prev];
        const entry = { ...updated[idx] };
        if (!entry.sources.some((s) => s.songTitle.toLowerCase() === source.songTitle.toLowerCase() && s.artist.toLowerCase() === source.artist.toLowerCase())) {
          entry.sources = [...entry.sources, { ...source, addedAt: Date.now() }];
          entry.updatedAt = Date.now();
        }
        updated[idx] = entry;
        return updated;
      }

      return [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        type,
        pro: options?.pro,
        ipi: options?.ipi,
        isMajor: options?.isMajor,
        socialLinks: options?.socialLinks,
        sources: [{ ...source, addedAt: Date.now() }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contactStatus: "not_contacted" as ContactStatus,
      }, ...prev].slice(0, 500);
    });
  }, [shouldUseLocalWatchlist, activeTeam, teamWatchlist]);

  const removeFromWatchlist = useCallback((id: string) => {
    if (!shouldUseLocalWatchlist) {
      if (!activeTeam) return;
      void teamWatchlist.removeFromWatchlist(id);
      return;
    }
    setLocalList((prev) => prev.filter((e) => e.id !== id));
  }, [shouldUseLocalWatchlist, activeTeam, teamWatchlist]);

  const updateContactStatus = useCallback((id: string, status: ContactStatus) => {
    if (!shouldUseLocalWatchlist) {
      if (!activeTeam) return;
      void teamWatchlist.updateContactStatus(id, status);
      return;
    }
    setLocalList((prev) => prev.map((e) => e.id === id ? { ...e, contactStatus: status, updatedAt: Date.now() } : e));
  }, [shouldUseLocalWatchlist, activeTeam, teamWatchlist]);

  const updateContactNotes = useCallback((id: string, notes: string) => {
    if (!shouldUseLocalWatchlist) {
      if (!activeTeam) return;
      void teamWatchlist.updateContactNotes(id, notes);
      return;
    }
    setLocalList((prev) => prev.map((e) => e.id === id ? { ...e, contactNotes: notes, updatedAt: Date.now() } : e));
  }, [shouldUseLocalWatchlist, activeTeam, teamWatchlist]);

  const isInWatchlist = useCallback((name: string, type: WatchlistEntityType): boolean => {
    if (!shouldUseLocalWatchlist) return teamWatchlist.isInWatchlist(name, type);
    return localList.some((e) => e.name.toLowerCase() === name.toLowerCase() && e.type === type);
  }, [shouldUseLocalWatchlist, teamWatchlist, localList]);

  const getWatchlistEntry = useCallback((name: string, type: WatchlistEntityType): WatchlistEntry | undefined => {
    return watchlist.find((e) => e.name.toLowerCase() === name.toLowerCase() && e.type === type);
  }, [watchlist]);

  const getFilteredWatchlist = useCallback((filters?: { type?: WatchlistEntityType; isMajor?: boolean }): WatchlistEntry[] => {
    let filtered = [...watchlist];
    if (filters?.type) filtered = filtered.filter((e) => e.type === filters.type);
    if (filters?.isMajor !== undefined) filtered = filtered.filter((e) => e.isMajor === filters.isMajor);
    return filtered.sort((a, b) => b.sources.length - a.sources.length);
  }, [watchlist]);

  const getStats = useCallback(() => {
    if (!shouldUseLocalWatchlist) return teamWatchlist.getStats();
    const byType: Record<WatchlistEntityType, number> = { writer: 0, producer: 0, artist: 0, publisher: 0, label: 0 };
    let majorCount = 0;
    let indieCount = 0;
    let totalAppearances = 0;

    localList.forEach((entry) => {
      byType[entry.type]++;
      if (entry.isMajor === true) majorCount++;
      if (entry.isMajor === false) indieCount++;
      totalAppearances += entry.sources.length;
    });

    return { total: localList.length, byType, majorCount, indieCount, totalAppearances };
  }, [shouldUseLocalWatchlist, teamWatchlist, localList]);

  return {
    watchlist,
    activity: shouldUseLocalWatchlist ? [] : teamWatchlist.activity,
    isLoading: shouldUseLocalWatchlist ? false : teamWatchlist.isLoading,
    addToWatchlist,
    removeFromWatchlist,
    updateContactStatus,
    updateContactNotes,
    assignToUser: isTeamMode ? teamWatchlist.assignToUser : async () => {},
    fetchActivity: isTeamMode ? teamWatchlist.fetchActivity : async () => {},
    isInWatchlist,
    getWatchlistEntry,
    getFilteredWatchlist,
    getStats,
    isTeamMode,
    members: isTeamMode ? members : [],
  };
}
