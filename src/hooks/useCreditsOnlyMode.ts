import { useState, useCallback, useEffect } from "react";
import { readStorageItem, writeStorageItem } from "@/lib/localStorage";

const STORAGE_KEYS = ["publisting-credits-only-mode", "pubcheck-credits-only-mode", "qoda-credits-only-mode"] as const;
const STORAGE_KEY = STORAGE_KEYS[0];

export function useCreditsOnlyMode() {
  const [isCreditsOnlyMode, setIsCreditsOnlyMode] = useState<boolean>(() => {
    try {
      const stored = readStorageItem(STORAGE_KEYS);
      return stored === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    writeStorageItem(STORAGE_KEY, String(isCreditsOnlyMode));
  }, [isCreditsOnlyMode]);

  const toggleCreditsOnlyMode = useCallback(() => {
    setIsCreditsOnlyMode((prev) => !prev);
  }, []);

  return {
    isCreditsOnlyMode,
    setIsCreditsOnlyMode,
    toggleCreditsOnlyMode,
  };
}
