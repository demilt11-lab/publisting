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
import { BadgeCheck, Building2, ExternalLink, Loader2 } from "lucide-react";
import { SocialFreshness } from "@/components/social/SocialFreshness";

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

export function SocialProfilesPanel(props: Props) {
  const { ownerType, ownerId } = props;
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

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
            {p.avatar_url ? (
              <img
                src={p.avatar_url}
                alt={p.handle}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-muted" />
            )}
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
            {p.external_link && (
              <a
                href={p.external_link}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
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
    </Card>
  );
}