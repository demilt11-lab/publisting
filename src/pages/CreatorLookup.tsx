import { useState } from "react";
import {
  fetchSocialProfile,
  type SocialPlatform,
  type SocialProfile,
} from "@/lib/api/socialProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BadgeCheck, ExternalLink, Building2 } from "lucide-react";

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat().format(n);
}

export default function CreatorLookup() {
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchSocialProfile(platform, handle);
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-3xl py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Creator Lookup</h1>
        <p className="text-sm text-muted-foreground">
          Look up an Instagram or TikTok creator by handle.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1">
            {PLATFORMS.map((p) => (
              <Button
                key={p.id}
                type="button"
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
          <Button type="submit" disabled={loading || !handle.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>
        {error && (
          <div className="mt-3 text-sm text-destructive">{error}</div>
        )}
      </Card>

      {profile && (
        <Card className="p-5">
          <div className="flex gap-4">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_hd_url || profile.avatar_url}
                alt={profile.handle}
                className="h-20 w-20 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate">
                  @{profile.handle}
                </h2>
                {profile.is_verified && (
                  <BadgeCheck className="h-4 w-4 text-primary" />
                )}
                {profile.is_business && (
                  <Badge variant="outline" className="gap-1">
                    <Building2 className="h-3 w-3" /> Business
                  </Badge>
                )}
                <Badge variant="secondary" className="capitalize">
                  {profile.platform}
                </Badge>
              </div>
              {profile.display_name && (
                <div className="text-sm text-muted-foreground">
                  {profile.display_name}
                </div>
              )}
              {profile.bio && (
                <p className="text-sm mt-2 whitespace-pre-wrap">
                  {profile.bio}
                </p>
              )}
              {profile.external_link && (
                <a
                  href={profile.external_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary inline-flex items-center gap-1 mt-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  {profile.external_link}
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 text-center">
            <Stat label="Followers" value={fmt(profile.followers)} />
            <Stat label="Following" value={fmt(profile.following)} />
            <Stat label="Posts" value={fmt(profile.posts)} />
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Last updated{" "}
            {new Date(profile.last_fetched_at).toLocaleString()}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}