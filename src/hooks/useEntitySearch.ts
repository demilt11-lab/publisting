import { useState, useCallback } from "react";
import { searchEntities, type EntitySearchResult } from "@/lib/api/entitySearch";
import type { EntityType } from "@/lib/api/entityResolver";

export function useEntitySearch() {
  const [result, setResult] = useState<EntitySearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const search = useCallback(async (
    query: string,
    opts?: { types?: EntityType[]; limit?: number },
  ) => {
    if (!query.trim()) { setResult(null); return null; }
    setIsLoading(true);
    try {
      const r = await searchEntities(query, opts);
      setResult(r);
      return r;
    } finally { setIsLoading(false); }
  }, []);

  const reset = useCallback(() => setResult(null), []);

  return { result, isLoading, search, reset };
}
