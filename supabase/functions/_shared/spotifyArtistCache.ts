// Shared cache helpers for Spotify artist data (followers, popularity, etc.)
// Reads/writes via the service role; safe to call from any edge function.
import { createClient } from "npm:@supabase/supabase-js@2";

export interface SpotifyArtistCacheRow {
  spotify_artist_id: string;
  followers: number | null;
  popularity: number | null;
  display_name: string | null;
  image_url: string | null;
  genres: string[] | null;
  external_url: string | null;
  raw: any;
  fetched_at: string;
  expires_at: string;
}

// Default TTL = 6h. Override per-call or via SPOTIFY_ARTIST_CACHE_TTL_SECONDS env.
function defaultTtlSeconds(): number {
  const fromEnv = Number(Deno.env.get("SPOTIFY_ARTIST_CACHE_TTL_SECONDS") ?? "");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 6 * 60 * 60;
}

function client() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function readSpotifyArtistCache(
  spotifyArtistId: string,
  opts?: { maxAgeSeconds?: number },
): Promise<SpotifyArtistCacheRow | null> {
  const sb = client();
  if (!sb || !spotifyArtistId) return null;
  try {
    const { data } = await sb
      .from("spotify_artist_cache")
      .select("*")
      .eq("spotify_artist_id", spotifyArtistId)
      .maybeSingle();
    if (!data) return null;
    const row = data as SpotifyArtistCacheRow;
    const expiresAt = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
    if (opts?.maxAgeSeconds && row.fetched_at) {
      const age = (Date.now() - new Date(row.fetched_at).getTime()) / 1000;
      if (age > opts.maxAgeSeconds) return null;
    }
    return row;
  } catch {
    return null;
  }
}

export async function writeSpotifyArtistCache(
  spotifyArtistId: string,
  payload: {
    followers?: number | null;
    popularity?: number | null;
    display_name?: string | null;
    image_url?: string | null;
    genres?: string[] | null;
    external_url?: string | null;
    raw?: any;
  },
  opts?: { ttlSeconds?: number },
): Promise<void> {
  const sb = client();
  if (!sb || !spotifyArtistId) return;
  const ttl = opts?.ttlSeconds ?? defaultTtlSeconds();
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 1000);
  try {
    await sb.from("spotify_artist_cache").upsert(
      {
        spotify_artist_id: spotifyArtistId,
        followers: payload.followers ?? null,
        popularity: payload.popularity ?? null,
        display_name: payload.display_name ?? null,
        image_url: payload.image_url ?? null,
        genres: payload.genres ?? null,
        external_url: payload.external_url ?? null,
        raw: payload.raw ?? null,
        fetched_at: now.toISOString(),
        expires_at: expires.toISOString(),
      },
      { onConflict: "spotify_artist_id" },
    );
  } catch {
    // best-effort
  }
}