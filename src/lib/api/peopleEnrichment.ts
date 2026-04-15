import { supabase } from '@/integrations/supabase/client';

const SESSION_CACHE_PREFIX = 'publisting_people_links_';
const SESSION_CACHE_TTL = 30 * 60 * 1000; // 30 min

export interface PersonLink {
  platform: string;
  url: string;
  confidence: number;
  source: string;
}

export interface PersonEnrichResult {
  personId: string;
  links: PersonLink[];
  cached: boolean;
}

function getCached(key: string): PersonEnrichResult | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_CACHE_TTL) {
      sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(key: string, data: PersonEnrichResult) {
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

/**
 * Trigger enrichment for a person. Returns their links.
 * Uses session cache to avoid redundant calls.
 */
export async function enrichPerson(
  name: string,
  role: string = 'mixed',
  trackUrl?: string
): Promise<PersonEnrichResult | null> {
  const cacheKey = `${name.toLowerCase().trim()}::${role}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('people-enrich', {
      body: { name, role, trackUrl },
    });

    if (error || !data?.success) {
      console.warn('People enrich failed:', error || data?.error);
      return null;
    }

    const result: PersonEnrichResult = {
      personId: data.personId,
      links: data.links || [],
      cached: data.cached || false,
    };

    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.warn('People enrich error:', e);
    return null;
  }
}

/**
 * Get links for a person by name (from people_links table).
 */
export async function getPersonLinks(
  name: string,
  role?: string
): Promise<{ personId: string | null; links: PersonLink[] }> {
  try {
    const { data, error } = await supabase.functions.invoke('people-links', {
      body: { action: 'get', name, role },
    });

    if (error || !data?.success) return { personId: null, links: [] };
    return {
      personId: data.person?.id || null,
      links: data.links || [],
    };
  } catch {
    return { personId: null, links: [] };
  }
}

/**
 * Batch lookup links for multiple names.
 */
export async function batchGetPersonLinks(
  names: string[]
): Promise<Record<string, { personId: string; links: PersonLink[]; needsEnrichment: boolean }>> {
  if (names.length === 0) return {};

  try {
    const { data, error } = await supabase.functions.invoke('people-links', {
      body: { action: 'batch', names },
    });

    if (error || !data?.success) return {};
    return data.results || {};
  } catch {
    return {};
  }
}

/**
 * Save manual link overrides for a person.
 */
export async function updatePersonLinks(
  personId: string,
  links: { platform: string; url: string }[]
): Promise<PersonLink[]> {
  try {
    const { data, error } = await supabase.functions.invoke('people-links', {
      body: { action: 'update', personId, links },
    });

    if (error || !data?.success) {
      console.error('Manual link update failed:', error || data?.error);
      return [];
    }

    return data.links || [];
  } catch {
    return [];
  }
}

/**
 * Convert PersonLink array to a flat Record<string, string> for CreditCard socialLinks.
 * Manual links take priority, then highest confidence wins per platform.
 */
export function linksToSocialMap(links: PersonLink[]): Record<string, string> {
  const map: Record<string, string> = {};
  // Sort: manual first, then by confidence desc
  const sorted = [...links].sort((a, b) => {
    if (a.source === 'manual' && b.source !== 'manual') return -1;
    if (b.source === 'manual' && a.source !== 'manual') return 1;
    return b.confidence - a.confidence;
  });

  for (const link of sorted) {
    if (!map[link.platform]) {
      map[link.platform] = link.url;
    }
  }
  return map;
}
