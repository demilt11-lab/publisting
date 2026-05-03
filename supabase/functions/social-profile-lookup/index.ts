// Social profile lookup edge function.
//
// This edge function is the ONLY source of truth for fetching social profile
// data (Instagram / TikTok) in the app. Frontend code must never call SearchApi
// (or any other upstream provider) directly — it must always go through one of
// the two routes implemented here:
//
//   POST /social-profile-lookup       body { platform, handle }
//   GET  /social-profile-lookup?platform=...&handle=...
//
// Internally, all fetches go through `getSocialProfile`, which is backed by a
// SocialProvider implementation. The current implementation is
// `searchapiSocialProvider`. To swap providers later (custom scraper, another
// API), implement the SocialProvider interface and route through it.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---------- Types ----------
type SocialPlatform = "instagram" | "tiktok";

interface SocialProfile {
  platform: SocialPlatform;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_hd_url: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  is_verified: boolean | null;
  is_business: boolean | null;
  external_link: string | null;
  raw_response: any;
  last_fetched_at: string;
  last_fetch_status?: string;
  last_fetch_error?: string | null;
  id?: string;
  artist_id?: string | null;
  publisher_id?: string | null;
  owner?: SocialProfileOwner;
}

type SocialProfileOwner =
  | { type: "artist"; artist: any }
  | { type: "publisher"; publisher: any }
  | { type: "none" };

interface SocialProvider {
  fetchProfile(
    platform: SocialPlatform,
    handle: string,
  ): Promise<{ profile: Omit<SocialProfile, "last_fetched_at">; raw: any }>;
}

type FetchFailureKind = "not_found" | "rate_limited" | "error";

class ProviderFetchError extends Error {
  kind: FetchFailureKind;
  constructor(kind: FetchFailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

// ---------- Helpers ----------
function normalizeHandle(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function rowToProfile(row: any): SocialProfile {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    display_name: row.display_name ?? null,
    bio: row.bio ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_hd_url: row.avatar_hd_url ?? null,
    followers: row.followers ?? null,
    following: row.following ?? null,
    posts: row.posts ?? null,
    is_verified: row.is_verified ?? null,
    is_business: row.is_business ?? null,
    external_link: row.external_link ?? null,
    raw_response: row.raw_response ?? null,
    last_fetched_at: row.last_fetched_at,
    last_fetch_status: row.last_fetch_status ?? "success",
    last_fetch_error: row.last_fetch_error ?? null,
    artist_id: row.artist_id ?? null,
    publisher_id: row.publisher_id ?? null,
    owner: row.artists
      ? { type: "artist", artist: row.artists }
      : row.publishers
        ? { type: "publisher", publisher: row.publishers }
        : { type: "none" },
  };
}

// ---------- SearchApi provider ----------
const SEARCHAPI_BASE = "https://www.searchapi.io/api/v1/search";

const searchapiSocialProvider: SocialProvider = {
  async fetchProfile(platform, handle) {
    const apiKey = Deno.env.get("SEARCHAPI_API_KEY");
    if (!apiKey) throw new Error("SEARCHAPI_API_KEY is not configured");

    const engine =
      platform === "instagram" ? "instagram_profile" : "tiktok_profile";
    const url = `${SEARCHAPI_BASE}?engine=${engine}&username=${encodeURIComponent(handle)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const snippet = JSON.stringify(json).slice(0, 200);
      if (res.status === 404) {
        throw new ProviderFetchError("not_found", `404: ${snippet}`);
      }
      if (res.status === 429) {
        throw new ProviderFetchError("rate_limited", `429: ${snippet}`);
      }
      throw new ProviderFetchError("error", `HTTP ${res.status}: ${snippet}`);
    }

    const status = json?.search_metadata?.status;
    const profile = json?.profile;
    if (status !== "Success" && status !== "success") {
      throw new ProviderFetchError(
        "error",
        `SearchApi non-success status: ${status ?? "unknown"}`,
      );
    }
    if (!profile) {
      throw new ProviderFetchError("not_found", "No profile in response");
    }

    let externalLink: string | null = null;
    if (platform === "instagram") {
      externalLink =
        profile.external_link ??
        (Array.isArray(profile.bio_links) && profile.bio_links[0]?.url) ??
        null;
    } else {
      externalLink = profile.bio_link ?? null;
    }

    return {
      raw: json,
      profile: {
        platform,
        handle: normalizeHandle(profile.username || handle),
        display_name: profile.name ?? null,
        bio: profile.bio ?? null,
        avatar_url: profile.avatar ?? null,
        avatar_hd_url: profile.avatar_hd ?? null,
        followers: typeof profile.followers === "number" ? profile.followers : null,
        following: typeof profile.following === "number" ? profile.following : null,
        posts: typeof profile.posts === "number" ? profile.posts : null,
        is_verified:
          typeof profile.is_verified === "boolean" ? profile.is_verified : null,
        is_business:
          typeof profile.is_business === "boolean" ? profile.is_business : null,
        external_link: externalLink,
        raw_response: json,
      },
    };
  },
};

// ---------- Core abstraction ----------
const FRESH_WINDOW_MS = (() => {
  const env = Deno.env.get("SOCIAL_PROFILE_FRESH_WINDOW_MS");
  const parsed = env ? parseInt(env, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
})();
const provider: SocialProvider = searchapiSocialProvider;

async function getSocialProfile(
  platform: SocialPlatform,
  handleInput: string,
  options: { forceRefresh?: boolean } = {},
): Promise<SocialProfile> {
  if (platform !== "instagram" && platform !== "tiktok") {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  const handle = normalizeHandle(handleInput);
  if (!handle) throw new Error("Handle is required");

  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("social_profiles")
    .select("*, artists(*), publishers(*)")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();

  if (existing && !options.forceRefresh) {
    const age = Date.now() - new Date(existing.last_fetched_at).getTime();
    const fresh = age < FRESH_WINDOW_MS;
    if (fresh && (existing.last_fetch_status ?? "success") === "success") {
      console.log(`[social-profile] cache hit ${platform}/${handle}`);
      return rowToProfile(existing);
    }
  }

  console.log(
    `[social-profile] upstream fetch ${platform}/${handle} (force=${!!options.forceRefresh})`,
  );

  try {
    const { profile } = await provider.fetchProfile(platform, handle);
    const now = new Date().toISOString();
    const { data: upserted, error } = await supabase
      .from("social_profiles")
      .upsert(
        {
          ...profile,
          last_fetched_at: now,
          last_fetch_status: "success",
          last_fetch_error: null,
        },
        { onConflict: "platform,handle" },
      )
      .select("*, artists(*), publishers(*)")
      .single();
    if (error) throw new Error(`Failed to persist profile: ${error.message}`);
    console.log(`[social-profile] success ${platform}/${handle}`);
    return rowToProfile(upserted);
  } catch (err) {
    const kind: FetchFailureKind =
      err instanceof ProviderFetchError ? err.kind : "error";
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    console.warn(
      `[social-profile] failure ${platform}/${handle} status=${kind} msg=${message}`,
    );
    if (existing) {
      await supabase
        .from("social_profiles")
        .update({
          last_fetched_at: now,
          last_fetch_status: kind,
          last_fetch_error: message.slice(0, 500),
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("social_profiles")
        .upsert(
          {
            platform,
            handle,
            raw_response: null,
            last_fetched_at: now,
            last_fetch_status: kind,
            last_fetch_error: message.slice(0, 500),
          },
          { onConflict: "platform,handle" },
        );
    }
    throw new ProviderFetchError(kind, message);
  }
}

// ---------- Linking helpers ----------
async function linkSocialProfileToArtist(
  socialProfileId: string,
  artistId: string,
): Promise<SocialProfile> {
  const supabase = getSupabase();
  const { data: artist, error: aErr } = await supabase
    .from("artists").select("id").eq("id", artistId).maybeSingle();
  if (aErr || !artist) throw new Error("Artist not found");
  const { data, error } = await supabase
    .from("social_profiles")
    .update({ artist_id: artistId, publisher_id: null })
    .eq("id", socialProfileId)
    .select("*, artists(*), publishers(*)")
    .single();
  if (error) throw new Error(`Link failed: ${error.message}`);
  return rowToProfile(data);
}

async function linkSocialProfileToPublisher(
  socialProfileId: string,
  publisherId: string,
): Promise<SocialProfile> {
  const supabase = getSupabase();
  const { data: pub, error: pErr } = await supabase
    .from("publishers").select("id").eq("id", publisherId).maybeSingle();
  if (pErr || !pub) throw new Error("Publisher not found");
  const { data, error } = await supabase
    .from("social_profiles")
    .update({ publisher_id: publisherId, artist_id: null })
    .eq("id", socialProfileId)
    .select("*, artists(*), publishers(*)")
    .single();
  if (error) throw new Error(`Link failed: ${error.message}`);
  return rowToProfile(data);
}

// ---------- HTTP handler ----------
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : "Unknown error";
  return jsonResponse({ error: message }, status);
}

function mapProviderError(err: unknown): Response {
  if (err instanceof ProviderFetchError) {
    if (err.kind === "not_found") {
      return jsonResponse(
        { error: "No profile found for this handle on this platform.", status: "not_found" },
        404,
      );
    }
    if (err.kind === "rate_limited") {
      return jsonResponse(
        { error: "Upstream is temporarily rate-limited, please try again later.", status: "rate_limited" },
        429,
      );
    }
    return jsonResponse(
      { error: "Unexpected error fetching this profile.", status: "error", detail: err.message },
      502,
    );
  }
  return errorResponse(err, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Action-based POST routes for linking
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;
      if (action === "link_artist") {
        if (!body.social_profile_id || !body.artist_id) {
          return errorResponse("Missing 'social_profile_id' or 'artist_id'", 400);
        }
        const updated = await linkSocialProfileToArtist(
          body.social_profile_id, body.artist_id,
        );
        return jsonResponse(updated);
      }
      if (action === "link_publisher") {
        if (!body.social_profile_id || !body.publisher_id) {
          return errorResponse("Missing 'social_profile_id' or 'publisher_id'", 400);
        }
        const updated = await linkSocialProfileToPublisher(
          body.social_profile_id, body.publisher_id,
        );
        return jsonResponse(updated);
      }
      // Fall through: treat as lookup
      const platform = body?.platform ?? null;
      const handle = body?.handle ?? null;
      if (!platform || !handle) {
        return errorResponse("Missing 'platform' or 'handle'", 400);
      }
      if (platform !== "instagram" && platform !== "tiktok") {
        return errorResponse(
          "Invalid platform. Must be 'instagram' or 'tiktok'.", 400,
        );
      }
      const profile = await getSocialProfile(platform as SocialPlatform, handle);
      return jsonResponse(profile);
    }

    let platform: string | null = null;
    let handle: string | null = null;

    if (req.method === "GET") {
      platform = url.searchParams.get("platform");
      handle = url.searchParams.get("handle");
    } else {
      return errorResponse(`Unsupported method: ${req.method}`, 405);
    }

    if (!platform || !handle) {
      return errorResponse("Missing 'platform' or 'handle'", 400);
    }
    if (platform !== "instagram" && platform !== "tiktok") {
      return errorResponse(
        "Invalid platform. Must be 'instagram' or 'tiktok'.",
        400,
      );
    }

    const profile = await getSocialProfile(
      platform as SocialPlatform,
      handle,
    );
    return jsonResponse(profile);
  } catch (err) {
    console.error("social-profile-lookup error:", err);
    return errorResponse(err, 500);
  }
});