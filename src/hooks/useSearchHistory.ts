import { useState, useCallback } from "react";
import { readStorageItem, removeStorageItems, writeStorageItem } from "@/lib/localStorage";

export interface SearchHistoryEntry {
  query: string;
  title: string;
  artist: string;
  coverUrl?: string;
  timestamp: number;
  signedCount?: number;
  totalCount?: number;
  pinned?: boolean;
}

const STORAGE_KEYS = ["publisting-search-history", "pubcheck-search-history", "qoda-search-history"] as const;
const STORAGE_KEY = STORAGE_KEYS[0];
const MAX_ENTRIES = 500;

function loadHistory(): SearchHistoryEntry[] {
  try {
    const raw = readStorageItem(STORAGE_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: SearchHistoryEntry[]) {
  writeStorageItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>(loadHistory);

  const addEntry = useCallback((entry: Omit<SearchHistoryEntry, "timestamp">) => {
    setHistory((prev) => {
      // De-duplicate by query OR by same title+artist
      const filtered = prev.filter(
        (e) => e.query.toLowerCase() !== entry.query.toLowerCase() &&
               !(e.title.toLowerCase() === entry.title.toLowerCase() && e.artist.toLowerCase() === entry.artist.toLowerCase())
      );
      const updated = [{ ...entry, timestamp: Date.now(), pinned: entry.pinned ?? false }, ...filtered].slice(0, MAX_ENTRIES);
      // Re-sort: pinned first
      updated.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    removeStorageItems(STORAGE_KEYS);
  }, []);

  const removeEntry = useCallback((query: string) => {
    setHistory((prev) => {
      const updated = prev.filter(
        (e) => e.query.toLowerCase() !== query.toLowerCase()
      );
      saveHistory(updated);
      return updated;
    });
  }, []);

  const togglePin = useCallback((query: string) => {
    setHistory((prev) => {
      const updated = prev.map((e) =>
        e.query.toLowerCase() === query.toLowerCase()
          ? { ...e, pinned: !e.pinned }
          : e
      );
      updated.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      saveHistory(updated);
      return updated;
    });
  }, []);

  const updateEntryCredits = useCallback((query: string, signedCount: number, totalCount: number) => {
    setHistory((prev) => {
      const updated = prev.map((e) =>
        e.query.toLowerCase() === query.toLowerCase()
          ? { ...e, signedCount, totalCount }
          : e
      );
      saveHistory(updated);
      return updated;
    });
  }, []);

  return { history, addEntry, clearHistory, removeEntry, togglePin, updateEntryCredits };
}
