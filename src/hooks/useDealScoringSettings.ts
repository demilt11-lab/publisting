import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DealScoringWeights {
  streaming_weight: number;
  social_weight: number;
  catalog_depth_weight: number;
  deal_stage_weight: number;
  priority_weight: number;
}

export const DEFAULT_WEIGHTS: DealScoringWeights = {
  streaming_weight: 30,
  social_weight: 20,
  catalog_depth_weight: 15,
  deal_stage_weight: 20,
  priority_weight: 15,
};

export const DEAL_SCORE_THRESHOLDS = {
  high: 70,
  medium: 40,
};

export function getBucketLabel(score: number): { label: string; range: string } {
  if (score >= DEAL_SCORE_THRESHOLDS.high) return { label: "High", range: "70+" };
  if (score >= DEAL_SCORE_THRESHOLDS.medium) return { label: "Medium", range: "40–69" };
  return { label: "Low", range: "<40" };
}

export function useDealScoringSettings() {
  const { user } = useAuth();
  const [weights, setWeights] = useState<DealScoringWeights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("deal_scoring_settings" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWeights({
            streaming_weight: (data as any).streaming_weight,
            social_weight: (data as any).social_weight,
            catalog_depth_weight: (data as any).catalog_depth_weight,
            deal_stage_weight: (data as any).deal_stage_weight,
            priority_weight: (data as any).priority_weight,
          });
        }
        setLoading(false);
      });
  }, [user]);

  const save = useCallback(async (newWeights: DealScoringWeights) => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("deal_scoring_settings" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("deal_scoring_settings" as any)
          .update({
            ...newWeights,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("deal_scoring_settings" as any)
          .insert({ ...newWeights, user_id: user.id } as any);
      }
      setWeights(newWeights);
    } finally {
      setSaving(false);
    }
  }, [user]);

  const totalWeight = weights.streaming_weight + weights.social_weight + weights.catalog_depth_weight + weights.deal_stage_weight + weights.priority_weight;

  return { weights, setWeights, save, loading, saving, totalWeight };
}
