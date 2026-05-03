import { supabase } from "@/integrations/supabase/client";

/**
 * SocialProfile is the only shape the frontend should use for Instagram/TikTok
 * creator data. All fetches go through the `social-profile-lookup` edge
 * function — the frontend must never call SearchApi (or any other upstream
 * provider) directly.
 */
export type SocialPlatform = "instagram" | "tiktok";

export type SocialProfileOwner =
  | { type: "artist"; artist: any }
  | { type: "publisher"; publisher: any }
  | { type: "none" };

export interface SocialProfile {
  id?: string;
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
  artist_id?: string | null;
  publisher_id?: string | null;
  owner?: SocialProfileOwner;
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

export async function linkSocialProfileToArtist(
  socialProfileId: string,
  artistId: string,
): Promise<SocialProfile> {
  const { data, error } = await supabase.functions.invoke(
    "social-profile-lookup",
    { body: { action: "link_artist", social_profile_id: socialProfileId, artist_id: artistId } },
  );
  if (error) throw new Error(error.message || "Link failed");
  if (!data || (data as any).error) throw new Error((data as any)?.error || "Link failed");
  return data as SocialProfile;
}

export async function linkSocialProfileToPublisher(
  socialProfileId: string,
  publisherId: string,
): Promise<SocialProfile> {
  const { data, error } = await supabase.functions.invoke(
    "social-profile-lookup",
    { body: { action: "link_publisher", social_profile_id: socialProfileId, publisher_id: publisherId } },
  );
  if (error) throw new Error(error.message || "Link failed");
  if (!data || (data as any).error) throw new Error((data as any)?.error || "Link failed");
  return data as SocialProfile;
}

export async function listSocialProfilesForArtist(
  artistId: string,
): Promise<SocialProfile[]> {
  const { data, error } = await supabase
    .from("social_profiles" as any)
    .select("*")
    .eq("artist_id", artistId)
    .order("platform");
  if (error) throw new Error(error.message);
  return (data || []) as SocialProfile[];
}

export async function listSocialProfilesForPublisher(
  publisherId: string,
): Promise<SocialProfile[]> {
  const { data, error } = await supabase
    .from("social_profiles" as any)
    .select("*")
    .eq("publisher_id", publisherId)
    .order("platform");
  if (error) throw new Error(error.message);
  return (data || []) as SocialProfile[];
}