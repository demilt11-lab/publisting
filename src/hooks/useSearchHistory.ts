import { useState, useCallback } from "react";

export interface SearchHistoryEntry {
  query: string;
  title: string;
  artist: string;
  coverUrl?: string;
  timestamp: number;
}

const STORAGE_KEY = "pubcheck-search-history";
const MAX_ENTRIES = 10;

function loadHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: SearchHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>(loadHistory);

  const addEntry = useCallback((entry: Omit<SearchHistoryEntry, "timestamp">) => {
    setHistory((prev) => {
      // Remove duplicate by query
      const filtered = prev.filter(
        (e) => e.query.toLowerCase() !== entry.query.toLowerCase()
      );
      const updated = [{ ...entry, timestamp: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
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

  return { history, addEntry, clearHistory, removeEntry };
}
