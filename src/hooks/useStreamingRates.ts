import { useState, useEffect } from 'react';
import { fetchActiveRates, StreamingRate, getRegionalPublishingRates } from '@/lib/api/streamingRates';

export function useStreamingRates() {
  const [rates, setRates] = useState<StreamingRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchActiveRates().then(data => {
      if (!cancelled) {
        setRates(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const regionalRates = rates.length > 0 ? getRegionalPublishingRates(rates) : null;

  return { rates, loading, regionalRates };
}
