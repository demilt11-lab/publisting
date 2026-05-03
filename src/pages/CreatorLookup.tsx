import { useEffect, useState } from "react";
import {
  fetchSocialProfile,
  linkSocialProfileToArtist,
  type SocialPlatform,
  type SocialProfile,
} from "@/lib/api/socialProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, BadgeCheck, ExternalLink, Building2, Link2, Check, AtSign,
} from "lucide-react";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { SocialProfilesPanel } from "@/components/social/SocialProfilesPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "spotify", label: "Spotify" },
];

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat().format(n);
}

interface ArtistMatch { id: string; name: string; pub_artist_id: string }

export default function CreatorLookup() {
  const navigate = useNavigate();
  const [shellSection, setShellSection] = useState<NavSection>("creator-lookup");
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  // Link-to-artist
  const [matches, setMatches] = useState<ArtistMatch[]>([]);
  const [linking, setLinking] = useState(false);
  const [searchingArtists, setSearchingArtists] = useState(false);

  const handleSectionChange = (section: NavSection) => {
    setShellSection(section);
    if (section !== "creator-lookup") {
      navigate("/", { state: { section } });
    }
  };

  const runLookup = async (forceRefresh: boolean) => {
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchSocialProfile(platform, handle, { forceRefresh });
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      if (!forceRefresh) setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  // When a profile loads, search artists DB for likely matches
  useEffect(() => {
    if (!profile) { setMatches([]); return; }
    const queryName = profile.display_name || profile.handle;
    if (!queryName) return;
    let cancelled = false;
    (async () => {
      setSearchingArtists(true);
      try {
        const { data } = await (supabase as any)
          .from("artists")
          .select("id, name, pub_artist_id")
          .ilike("name", `%${queryName}%`)
          .limit(8);
        if (!cancelled) setMatches((data ?? []) as ArtistMatch[]);
      } finally {
        if (!cancelled) setSearchingArtists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile]);

  const onLink = async (artistId: string) => {
    if (!profile?.id) return;
    setLinking(true);
    try {
      const updated = await linkSocialProfileToArtist(profile.id, artistId);
      setProfile(updated);
      toast({ title: "Linked", description: "Social profile linked to artist." });
    } catch (err) {
      toast({
        title: "Link failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(false);
  };

  const linkedArtistId = profile?.artist_id ?? null;

  return (
    <AppShell activeSection={shellSection} onSectionChange={handleSectionChange}>
      <div className="container max-w-4xl py-8 space-y-6 overflow-auto h-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <AtSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Creator Lookup</h1>
            <p className="text-sm text-muted-foreground">
              Look up an Instagram, TikTok, YouTube, or Spotify creator and link them to a Publisting artist.
            </p>
          </div>
        </div>

        <Card className="p-4">
          <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="flex flex-wrap gap-1">
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
              placeholder={platform === "spotify" ? "Artist name or Spotify ID" : "@handle"}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !handle.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>
          {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        </Card>

        {profile && (
          <Card className="p-5 space-y-4">
            <div className="flex gap-4">
              {profile.avatar_url ? (
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
                  <h2 className="text-lg font-semibold truncate">@{profile.handle}</h2>
                  {profile.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                  {profile.is_business && (
                    <Badge variant="outline" className="gap-1">
                      <Building2 className="h-3 w-3" /> Business
                    </Badge>
                  )}
                  <Badge variant="secondary" className="capitalize">{profile.platform}</Badge>
                  {linkedArtistId && (
                    <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                      <Check className="h-3 w-3" /> Linked
                    </Badge>
                  )}
                </div>
                {profile.display_name && (
                  <div className="text-sm text-muted-foreground">{profile.display_name}</div>
                )}
                {profile.bio && <p className="text-sm mt-2 whitespace-pre-wrap">{profile.bio}</p>}
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

            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label={profile.platform === "youtube" ? "Subscribers" : "Followers"} value={fmt(profile.followers)} />
              <Stat label={profile.platform === "youtube" ? "Total Views" : "Following"} value={fmt(profile.following)} />
              <Stat label={profile.platform === "youtube" ? "Videos" : "Posts"} value={fmt(profile.posts)} />
            </div>

            {/* Link to Artist */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Link to Artist in Publisting</h3>
              </div>
              {searchingArtists ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching artists…
                </div>
              ) : matches.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No matching artists found in Publisting yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {matches.map((m) => {
                    const isLinked = linkedArtistId === m.id;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/50"
                      >
                        <span className="text-sm flex-1 truncate">{m.name}</span>
                        <Badge variant="outline" className="text-[10px]">{m.pub_artist_id}</Badge>
                        <Button
                          size="sm"
                          variant={isLinked ? "secondary" : "default"}
                          disabled={linking || isLinked}
                          onClick={() => onLink(m.id)}
                        >
                          {isLinked ? (
                            <><Check className="h-3 w-3 mr-1" /> Linked</>
                          ) : linking ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Link"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Linked artist's full social panel for richer view + management */}
        {linkedArtistId && (
          <SocialProfilesPanel ownerType="artist" ownerId={linkedArtistId} />
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}