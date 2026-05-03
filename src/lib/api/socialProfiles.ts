import { supabase } from "@/integrations/supabase/client";

/**
 * SocialProfile is the only shape the frontend should use for Instagram/TikTok
 * creator data. All fetches go through the `social-profile-lookup` edge
 * function — the frontend must never call SearchApi (or any other upstream
 * provider) directly.
 */
export type SocialPlatform = "instagram" | "tiktok";

export interface SocialProfile {
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
  raw_response: unknown;
  last_fetched_at: string;
}

export async function fetchSocialProfile(
  platform: SocialPlatform,
  handle: string,
): Promise<SocialProfile> {
  const { data, error } = await supabase.functions.invoke(
    "social-profile-lookup",
    { body: { platform, handle } },
  );
  if (error) throw new Error(error.message || "Lookup failed");
  if (!data || (data as any).error) {
    throw new Error((data as any)?.error || "Lookup failed");
  }
  return data as SocialProfile;
}