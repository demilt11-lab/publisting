import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readStorageItem, writeStorageItem } from "@/lib/localStorage";

const BACKUP_KEYS = [
  { dataKey: "watchlist", storageKeys: ["publisting-watchlist", "pubcheck-watchlist", "qoda-watchlist"] as const },
  { dataKey: "search-history", storageKeys: ["publisting-search-history", "pubcheck-search-history", "qoda-search-history"] as const },
  { dataKey: "projects", storageKeys: ["publisting-projects", "pubcheck-projects", "qoda-projects"] as const },
] as const;

const BACKUP_INTERVAL_MS = 60_000; // auto-save every 60s
const LAST_BACKUP_KEY = "publisting-last-backup-ts";

/**
 * Automatically backs up local storage data to the database for authenticated users,
 * and restores it on login if local storage is empty.
 */
export function useLocalBackup() {
  const { user } = useAuth();
  const restoredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const backup = useCallback(async () => {
    if (!user) return;

    const entries = BACKUP_KEYS.map(({ dataKey, storageKeys }) => {
      const raw = readStorageItem(storageKeys);
      return { dataKey, raw };
    }).filter((e) => e.raw && e.raw !== "[]" && e.raw !== "{}");

    if (entries.length === 0) return;

    for (const { dataKey, raw } of entries) {
      try {
        const parsed = JSON.parse(raw!);
        await supabase
          .from("user_local_backups")
          .upsert(
            { user_id: user.id, data_key: dataKey, data_value: parsed, updated_at: new Date().toISOString() },
            { onConflict: "user_id,data_key" }
          );
      } catch {
        // Silently skip individual key failures
      }
    }

    try {
      localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  }, [user]);

  const restore = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("user_local_backups")
      .select("data_key, data_value")
      .eq("user_id", user.id);

    if (error || !data || data.length === 0) return;

    for (const row of data) {
      const config = BACKUP_KEYS.find((b) => b.dataKey === row.data_key);
      if (!config) continue;

      const existing = readStorageItem(config.storageKeys);
      // Only restore if local storage is empty or has no meaningful data
      if (existing && existing !== "[]" && existing !== "{}") continue;

      try {
        writeStorageItem(config.storageKeys[0], JSON.stringify(row.data_value));
      } catch {
        // ignore
      }
    }
  }, [user]);

  // On login: restore then start periodic backup
  useEffect(() => {
    if (!user) {
      restoredRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    if (!restoredRef.current) {
      restoredRef.current = true;
      restore().then(() => {
        // Dispatch event so hooks re-read localStorage
        window.dispatchEvent(new Event("storage"));
      });
    }

    // Initial backup after 5s, then every 60s
    const timeout = setTimeout(() => {
      backup();
      intervalRef.current = setInterval(backup, BACKUP_INTERVAL_MS);
    }, 5000);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, backup, restore]);

  // Backup on tab close
  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon-style sync approach via navigator
      const entries = BACKUP_KEYS.map(({ dataKey, storageKeys }) => {
        const raw = readStorageItem(storageKeys);
        return raw && raw !== "[]" && raw !== "{}" ? { dataKey, raw } : null;
      }).filter(Boolean) as { dataKey: string; raw: string }[];

      if (entries.length > 0) {
        // Fire-and-forget backup
        backup();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user, backup]);

  return { backup, restore };
}
