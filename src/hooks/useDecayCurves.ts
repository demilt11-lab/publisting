import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DecayCurve {
  genre: string;
  year1_weight: number;
  year2_weight: number;
  year3_weight: number;
}

const DEFAULT_DECAY: DecayCurve = { genre: 'default', year1_weight: 0.50, year2_weight: 0.30, year3_weight: 0.20 };

let cache: { data: DecayCurve[]; at: number } | null = null;
const TTL = 60 * 60 * 1000;

export function useDecayCurves() {
  const [curves, setCurves] = useState<DecayCurve[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL) {
      setCurves(cache.data);
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.from('decay_curves').select('genre, year1_weight, year2_weight, year3_weight').then(({ data }) => {
      if (cancelled) return;
      const parsed = (data ?? []).map(r => ({
        genre: r.genre,
        year1_weight: Number(r.year1_weight),
        year2_weight: Number(r.year2_weight),
        year3_weight: Number(r.year3_weight),
      }));
      cache = { data: parsed, at: Date.now() };
      setCurves(parsed);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  function getDecay(genre?: string): DecayCurve {
    if (!genre || curves.length === 0) return curves.find(c => c.genre === 'default') ?? DEFAULT_DECAY;
    const normalized = genre.toLowerCase().trim();
    const exact = curves.find(c => c.genre === normalized);
    if (exact) return exact;
    // Partial match
    const partial = curves.find(c => normalized.includes(c.genre) || c.genre.includes(normalized));
    if (partial) return partial;
    return curves.find(c => c.genre === 'default') ?? DEFAULT_DECAY;
  }

  return { curves, loading, getDecay };
}
