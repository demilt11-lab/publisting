import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Bell, GitCompare, Eye, Mail, Loader2, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCompareTray } from "@/hooks/useCompareTray";
import { trackEntity, type TrackableType } from "@/lib/api/trackEntity";
import { supabase } from "@/integrations/supabase/client";
import { useWatchlist } from "@/hooks/useWatchlist";

export interface ResultActionBarProps {
  entityType: TrackableType;
  pubId: string;
  label?: string;
  /** Optional: opens in compare tray. Requires entity_type + pub_id at minimum. */
  compact?: boolean;
}

/** Fast-action chip set for any discovery row or canonical-match card. */
export function ResultActionBar({ entityType, pubId, label, compact }: ResultActionBarProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const tray = useCompareTray();
  const { addToWatchlist, isInWatchlist } = useWatchlist();
  const [busy, setBusy] = useState<string | null>(null);
  const [tracked, setTracked] = useState(false);

  const requireAuth = () => {
    if (!user?.id) { toast({ title: "Sign in required", variant: "destructive" }); return false; }
    return true;
  };

  const onTrack = async () => {
    if (!requireAuth()) return;
    setBusy("track");
    const r = await trackEntity(user!.id, entityType, pubId, label, "manual");
    setBusy(null);
    if (r.ok) { setTracked(true); toast({ title: "Tracking enabled", description: label || pubId }); }
  };

  const onAlert = async () => {
    // Same as track for our purposes — both pin + subscribe.
    await onTrack();
  };

  const onCompare = () => {
    const kind: string = entityType === "creator" ? "writer" : entityType;
    if (!["artist", "track", "writer", "producer"].includes(kind)) {
      toast({ title: "Compare supports artists, tracks, writers, producers", variant: "destructive" });
      return;
    }
    tray.add({ kind: kind as any, pub_id: pubId, name: label || pubId });
    toast({ title: "Added to compare" });
  };

  const onWatchlist = async () => {
    if (!requireAuth()) return;
    if (entityType !== "artist") {
      toast({ title: "Only artists can be added to the watchlist", variant: "destructive" });
      return;
    }
    setBusy("watch");
    try {
      const name = label || pubId;
      await addToWatchlist(name, "artist", { songTitle: "", artist: "" });
      toast({
        title: isInWatchlist(name, "artist") ? "Already in watchlist" : "Added to watchlist",
        description: name,
      });
    } catch (e: any) {
      toast({ title: "Could not add to watchlist", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const onOutreach = async () => {
    if (!requireAuth()) return;
    setBusy("out");
    const payload: any = { created_by: user!.id, status: "new", stage: "lead", subject: label || pubId };
    if (entityType === "artist") payload.pub_artist_id = pubId;
    if (entityType === "track") payload.pub_track_id = pubId;
    if (entityType === "creator") payload.pub_creator_id = pubId;
    const { error } = await supabase.from("outreach_records").insert(payload);
    setBusy(null);
    if (!error) toast({ title: "Added to outreach" });
    else toast({ title: "Could not add to outreach", description: error.message, variant: "destructive" });
  };

  const Btn = ({ id, icon: Icon, label: l, onClick }: any) => (
    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[11px]"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      disabled={!!busy}>
      {busy === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {!compact && l}
    </Button>
  );

  return (
    <div className="flex items-center gap-0.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <Btn id="track" icon={tracked ? Check : Sparkles} label={tracked ? "Tracked" : "Track"} onClick={onTrack} />
      <Btn id="alert" icon={Bell} label="Alert" onClick={onAlert} />
      <Btn id="cmp" icon={GitCompare} label="Compare" onClick={onCompare} />
      {entityType === "artist" && (
        <Btn id="watch" icon={Eye} label="Watchlist" onClick={onWatchlist} />
      )}
      <Btn id="out" icon={Mail} label="Outreach" onClick={onOutreach} />
    </div>
  );
}