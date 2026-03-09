import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "pubcheck-credits-only-mode";

export function useCreditsOnlyMode() {
  const [isCreditsOnlyMode, setIsCreditsOnlyMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isCreditsOnlyMode));
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
