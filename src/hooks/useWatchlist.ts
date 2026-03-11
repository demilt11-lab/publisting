import { useState, useCallback, useEffect } from "react";

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
  songTitle: string;
  artist: string;
  projectId?: string;
  projectName?: string;
  addedAt: number;
}

export interface WatchlistEntry {
  id: string;
  name: string;
  type: WatchlistEntityType;
  pro?: string;
  ipi?: string;
  isMajor?: boolean;
  sources: WatchlistSource[];
  createdAt: number;
  updatedAt: number;
  contactStatus: ContactStatus;
  contactNotes?: string;
}

const STORAGE_KEY = "pubcheck-watchlist";
const MAX_ENTRIES = 500;

function loadWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(entries: WatchlistEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(loadWatchlist);

  useEffect(() => {
    saveWatchlist(watchlist);
  }, [watchlist]);

  const addToWatchlist = useCallback(
    (
      name: string,
      type: WatchlistEntityType,
      source: Omit<WatchlistSource, "addedAt">,
      options?: { pro?: string; ipi?: string; isMajor?: boolean }
    ) => {
      setWatchlist((prev) => {
        // Check if entry already exists
        const existingIdx = prev.findIndex(
          (e) =>
            e.name.toLowerCase() === name.toLowerCase() &&
            e.type === type
        );

        if (existingIdx >= 0) {
          // Update existing entry with new source
          const updated = [...prev];
          const entry = updated[existingIdx];
          
          // Check if this source already exists
          const sourceExists = entry.sources.some(
            (s) =>
              s.songTitle.toLowerCase() === source.songTitle.toLowerCase() &&
              s.artist.toLowerCase() === source.artist.toLowerCase()
          );

          if (!sourceExists) {
            entry.sources.push({ ...source, addedAt: Date.now() });
            entry.updatedAt = Date.now();
            // Update optional fields if provided
            if (options?.pro && !entry.pro) entry.pro = options.pro;
            if (options?.ipi && !entry.ipi) entry.ipi = options.ipi;
            if (options?.isMajor !== undefined) entry.isMajor = options.isMajor;
          }
          
          return updated;
        }

        // Create new entry
        const newEntry: WatchlistEntry = {
          id: generateId(),
          name,
          type,
          pro: options?.pro,
          ipi: options?.ipi,
          isMajor: options?.isMajor,
          sources: [{ ...source, addedAt: Date.now() }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          contactStatus: "not_contacted",
        };

        return [newEntry, ...prev].slice(0, MAX_ENTRIES);
      });
    },
    []
  );

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateContactStatus = useCallback((id: string, status: ContactStatus) => {
    setWatchlist((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, contactStatus: status, updatedAt: Date.now() } : e
      )
    );
  }, []);

  const updateContactNotes = useCallback((id: string, notes: string) => {
    setWatchlist((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, contactNotes: notes, updatedAt: Date.now() } : e
      )
    );
  }, []);

  const isInWatchlist = useCallback(
    (name: string, type: WatchlistEntityType): boolean => {
      return watchlist.some(
        (e) =>
          e.name.toLowerCase() === name.toLowerCase() &&
          e.type === type
      );
    },
    [watchlist]
  );

  const getWatchlistEntry = useCallback(
    (name: string, type: WatchlistEntityType): WatchlistEntry | undefined => {
      return watchlist.find(
        (e) =>
          e.name.toLowerCase() === name.toLowerCase() &&
          e.type === type
      );
    },
    [watchlist]
  );

  const getFilteredWatchlist = useCallback(
    (filters?: {
      type?: WatchlistEntityType;
      isMajor?: boolean;
    }): WatchlistEntry[] => {
      let filtered = [...watchlist];

      if (filters?.type) {
        filtered = filtered.filter((e) => e.type === filters.type);
      }

      if (filters?.isMajor !== undefined) {
        filtered = filtered.filter((e) => e.isMajor === filters.isMajor);
      }

      return filtered.sort((a, b) => b.sources.length - a.sources.length);
    },
    [watchlist]
  );

  const getStats = useCallback(() => {
    const byType: Record<WatchlistEntityType, number> = {
      writer: 0,
      producer: 0,
      artist: 0,
      publisher: 0,
      label: 0,
    };

    let majorCount = 0;
    let indieCount = 0;
    let totalAppearances = 0;

    watchlist.forEach((entry) => {
      byType[entry.type]++;
      if (entry.isMajor === true) majorCount++;
      if (entry.isMajor === false) indieCount++;
      totalAppearances += entry.sources.length;
    });

    return {
      total: watchlist.length,
      byType,
      majorCount,
      indieCount,
      totalAppearances,
    };
  }, [watchlist]);

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    updateContactStatus,
    updateContactNotes,
    isInWatchlist,
    getWatchlistEntry,
    getFilteredWatchlist,
    getStats,
  };
}
