import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface CreditFilters {
  pubStatus: "all" | "pub_signed" | "pub_unsigned" | "pub_unknown";
  labelStatus: "all" | "label_signed" | "label_unsigned" | "label_unknown";
  roleFilter: "all" | "artists" | "writers" | "producers";
}

export const DEFAULT_CREDIT_FILTERS: CreditFilters = {
  pubStatus: "all",
  labelStatus: "all",
  roleFilter: "all",
};

export const useFilterPreferences = () => {
  const { user } = useAuth();
  const [filters, setFiltersState] = useState<CreditFilters>(DEFAULT_CREDIT_FILTERS);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved preferences on login
  useEffect(() => {
    if (!user) {
      setFiltersState(DEFAULT_CREDIT_FILTERS);
      setIsLoaded(true);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("signing_status_filter, label_status_filter, role_filter")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setFiltersState({
          pubStatus: (data.signing_status_filter as CreditFilters["pubStatus"]) || "all",
          labelStatus: (data.label_status_filter as CreditFilters["labelStatus"]) || "all",
          roleFilter: (data.role_filter as CreditFilters["roleFilter"]) || "all",
        });
      }
      setIsLoaded(true);
    };
    load();
  }, [user]);

  // Debounced save to DB
  const persistFilters = useCallback(
    (newFilters: CreditFilters) => {
      if (!user) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await supabase.from("user_preferences").upsert(
          {
            user_id: user.id,
            signing_status_filter: newFilters.pubStatus,
            label_status_filter: newFilters.labelStatus,
            role_filter: newFilters.roleFilter,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }, 500);
    },
    [user]
  );

  const setFilters = useCallback(
    (newFilters: CreditFilters) => {
      setFiltersState(newFilters);
      persistFilters(newFilters);
    },
    [persistFilters]
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_CREDIT_FILTERS);
    if (user) persistFilters(DEFAULT_CREDIT_FILTERS);
  }, [user, persistFilters]);

  return { filters, setFilters, resetFilters, isLoaded };
};
