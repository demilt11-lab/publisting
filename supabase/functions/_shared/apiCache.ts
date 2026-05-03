// Generic shared cache for Soundcharts/Genius edge functions.
// Mirrors spotifyArtistCache pattern (6h TTL, force_refresh flag).
import { createClient } from "npm:@supabase/supabase-js@2";

function client() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function defaultTtl(envKey: string): number {
  const v = Number(Deno.env.get(envKey) ?? "");
  return Number.isFinite(v) && v > 0 ? v : 6 * 60 * 60;
}

export type CacheTable = "soundcharts_cache" | "genius_cache";

export interface CacheReadOpts {
  maxAgeSeconds?: number;
  forceRefresh?: boolean;
}

export async function readApiCache(
  table: CacheTable,
  cacheKey: string,
  opts: CacheReadOpts = {},
): Promise<any | null> {
  if (opts.forceRefresh) return null;
  const sb = client();
  if (!sb || !cacheKey) return null;
  try {
    const { data } = await sb.from(table).select("*").eq("cache_key", cacheKey).maybeSingle();
    if (!data) return null;
    const expires = new Date((data as any).expires_at).getTime();
    if (Number.isFinite(expires) && expires < Date.now()) return null;
    if (opts.maxAgeSeconds) {
      const fetched = (data as any).fetched_at ?? (data as any).created_at;
      const age = (Date.now() - new Date(fetched).getTime()) / 1000;
      if (age > opts.maxAgeSeconds) return null;
    }
    return (data as any).payload ?? (data as any).data ?? null;
  } catch {
    return null;
  }
}

export async function writeApiCache(
  table: CacheTable,
  cacheKey: string,
  payload: unknown,
  meta: { endpoint: string; entity_id?: string; entity_type?: string; ttlSeconds?: number },
): Promise<void> {
  const sb = client();
  if (!sb || !cacheKey) return;
  const ttl = meta.ttlSeconds ?? defaultTtl(
    table === "soundcharts_cache" ? "SOUNDCHARTS_CACHE_TTL_SECONDS" : "GENIUS_CACHE_TTL_SECONDS",
  );
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 1000);
  try {
    // soundcharts_cache uses `data`, genius_cache uses `payload`.
    const row: Record<string, unknown> = {
      cache_key: cacheKey,
      endpoint: meta.endpoint,
      entity_id: meta.entity_id ?? null,
      entity_type: meta.entity_type ?? null,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    if (table === "soundcharts_cache") {
      row.data = payload;
    } else {
      row.payload = payload;
    }
    await sb.from(table).upsert(row, { onConflict: "cache_key" });
  } catch {
    // best-effort
  }
}

export async function cacheStats(table: CacheTable): Promise<{ total: number; fresh: number; stale: number }> {
  const sb = client();
  if (!sb) return { total: 0, fresh: 0, stale: 0 };
  const { count: total } = await sb.from(table).select("*", { count: "exact", head: true });
  const { count: fresh } = await sb.from(table).select("*", { count: "exact", head: true })
    .gt("expires_at", new Date().toISOString());
  return { total: total ?? 0, fresh: fresh ?? 0, stale: (total ?? 0) - (fresh ?? 0) };
}