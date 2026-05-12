import { useEffect, useState } from "react";
import {
  fetchSocialProfile,
  linkSocialProfileToArtist,
  linkSocialProfileToPublisher,
  listSocialProfilesForArtist,
  listSocialProfilesForPublisher,
  type SocialPlatform,
  type SocialProfile,
} from "@/lib/api/socialProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Building2, ExternalLink, Loader2, ImageOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { SocialFreshness } from "@/components/social/SocialFreshness";
import { supabase } from "@/integrations/supabase/client";
import { safeProfileUrl, type SocialPlatformId } from "@/lib/links/socialUrls";

type Props =
  | { ownerType: "artist"; ownerId: string }
  | { ownerType: "publisher"; ownerId: string };

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "spotify", label: "Spotify" },
];

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat().format(n);
}

function proxiedAvatar(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    const projectId = (supabase as any)?.supabaseUrl
      ? new URL((supabase as any).supabaseUrl).hostname.split(".")[0]
      : undefined;
    if (!projectId) return url;
    return `https://${projectId}.supabase.co/functions/v1/social-avatar-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/**
 * Build the canonical profile URL for a social platform from a handle.
 * `external_link` on a profile is the bio link (e.g. Linktree) — NOT the
 * profile itself — so we construct the profile URL from the handle through
 * the shared sanitizer in `lib/links/socialUrls`.
 */
function profileUrlFor(
  platform: SocialPlatform,
  handle: string | null | undefined,
  displayName?: string | null,
): string | null {
  return safeProfileUrl(platform as SocialPlatformId, handle, displayName);
}

export function SocialProfilesPanel(props: Props) {
  const { ownerType, ownerId } = props;
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [avatarStage, setAvatarStage] = useState<Record<string, "proxy" | "direct" | "failed">>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | {
    ok: boolean;
    external_id?: string;
    external_url?: string;
    source?: string;
    spotify?: { display_name: string | null; followers: number | null; error: string | null };
    error?: string;
  }>(null);

  const reload = async () => {
    try {
      const list =
        ownerType === "artist"
          ? await listSocialProfilesForArtist(ownerId)
          : await listSocialProfilesForPublisher(ownerId);
      setProfiles(list);
    } catch (e) {
      // non-fatal
    }
  };

  const onRefresh = async (p: SocialProfile) => {
    if (!p.id) return;
    setRefreshingId(p.id);
    setError(null);
    try {
      await fetchSocialProfile(p.platform, p.handle, { forceRefresh: true });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const verifySpotifyLink = async () => {
    if (ownerType !== "artist") return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-profile-lookup", {
        body: { action: "verify_spotify_link", artist_id: ownerId },
      });
      if (error) {
        setVerifyResult({ ok: false, error: error.message });
      } else {
        setVerifyResult(data as any);
      }
    } catch (e) {
      setVerifyResult({ ok: false, error: e instanceof Error ? e.message : "Verify failed" });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, ownerType]);

  const onLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await fetchSocialProfile(platform, handle);
      if (!profile.id) throw new Error("Profile missing id");
      if (ownerType === "artist") {
        await linkSocialProfileToArtist(profile.id, ownerId);
      } else {
        await linkSocialProfileToPublisher(profile.id, ownerId);
      }
      setHandle("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Social profiles</h3>
        <span className="text-xs text-muted-foreground">
          {profiles.length} linked
        </span>
      </div>

      {profiles.length === 0 && (
        <div className="text-sm text-muted-foreground">
          No social profiles linked yet.
        </div>
      )}

      <div className="space-y-2">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 p-2 rounded-md border border-border bg-card/50"
          >
            {(() => {
              const key = p.id || `${p.platform}:${p.handle}`;
              const stage = avatarStage[key] ?? "proxy";
              if (!p.avatar_url || stage === "failed") {
                return (
                  <div
                    className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
                    title={stage === "failed" ? "Avatar unavailable" : "No avatar"}
                  >
                    <ImageOff className="h-4 w-4" />
                  </div>
                );
              }
              const src = stage === "proxy"
                ? proxiedAvatar(p.avatar_hd_url || p.avatar_url)
                : (p.avatar_url || undefined);
              return (
                <img
                  src={src}
                  alt={p.handle}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full object-cover bg-muted"
                  onError={() => {
                    setAvatarStage((prev) => ({
                      ...prev,
                      [key]: prev[key] === "proxy" ? "direct" : "failed",
                    }));
                  }}
                />
              );
            })()}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">
                  {p.platform === "spotify"
                    ? (p.display_name || p.handle)
                    : `@${p.handle}`}
                </span>
                {p.is_verified && (
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                )}
                {p.is_business && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Building2 className="h-3 w-3" /> Business
                  </Badge>
                )}
                <Badge variant="secondary" className="capitalize text-[10px]">
                  {p.platform}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {p.platform === "spotify" ? (p.bio || "") : (p.display_name || "")}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.platform === "spotify"
                  ? `${fmt(p.followers)} monthly listeners`
                  : `${fmt(p.followers)} followers · ${fmt(p.posts)} posts`}
              </div>
              <div className="mt-1">
                <SocialFreshness
                  lastFetchedAt={p.last_fetched_at}
                  status={p.last_fetch_status}
                  onRefresh={() => onRefresh(p)}
                  refreshing={refreshingId === p.id}
                />
              </div>
            </div>
            {(() => {
              const profileUrl = profileUrlFor(p.platform, p.handle);
              if (!profileUrl) return null;
              return (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  title={`Open ${p.platform} profile`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              );
            })()}
          </div>
        ))}
      </div>

      <form onSubmit={onLink} className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
        <div className="flex gap-1">
          {PLATFORMS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={platform === p.id ? "default" : "outline"}
              onClick={() => setPlatform(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={busy || !handle.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link profile"}
        </Button>
      </form>
      {error && <div className="text-xs text-destructive">{error}</div>}

      {ownerType === "artist" && profiles.some((p) => p.platform === "spotify") && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Spotify sync verification</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={verifySpotifyLink}
              disabled={verifying}
            >
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
              Verify Spotify link
            </Button>
          </div>
          {verifyResult && (
            <div
              className={
                "text-xs rounded-md border p-2 " +
                (verifyResult.ok
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-destructive/40 bg-destructive/5 text-foreground")
              }
            >
              {verifyResult.ok ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 font-medium">
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" /> external_id written
                  </div>
                  <div>
                    Spotify ID: <span className="font-mono">{verifyResult.external_id}</span>
                    {verifyResult.source && <> · source: {verifyResult.source}</>}
                  </div>
                  <div>
                    Live followers: <strong>{fmt(verifyResult.spotify?.followers ?? null)}</strong>
                    {verifyResult.spotify?.display_name && <> · {verifyResult.spotify.display_name}</>}
                  </div>
                  {verifyResult.external_url && (
                    <a
                      href={verifyResult.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open on Spotify <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Verification failed
                  </div>
                  <div>{verifyResult.error || verifyResult.spotify?.error || "Could not confirm linked Spotify artist."}</div>
                  {verifyResult.external_id && (
                    <div>external_id present: <span className="font-mono">{verifyResult.external_id}</span></div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}