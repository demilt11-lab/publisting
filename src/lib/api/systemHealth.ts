import { supabase } from "@/integrations/supabase/client";

export interface ServiceHealth {
  total: number;
  success: number;
  errors: number;
  rate_limited: number;
  validation_errors: number;
  success_rate: number;
  limit: number;
  current: number;
  usage_pct: number;
}

export interface SystemHealth {
  ok: boolean;
  generated_at: string;
  overall: {
    api_calls: number;
    success_rate: number;
    validation_errors: number;
    cache_entries: number;
    fresh_cache_entries: number;
    cache_hit_rate: number;
    queue: Record<string, number>;
  };
  services: Record<string, ServiceHealth>;
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const { data, error } = await supabase.functions.invoke("system-health", { body: {} });
  if (error) throw error;
  return data as SystemHealth;
}