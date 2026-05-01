import { useEffect, useState } from "react";
import { useTeamContext } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  listWatchlists, createWatchlist, deleteWatchlist,
  listWatchlistItems, removeWatchlistItem,
  listComments, addComment, listDecisions, logDecision,
  type SharedWatchlist, type SharedWatchlistItem, type CollabComment, type DecisionLog,
} from "@/lib/api/collaboration";
import { Loader2, Plus, Trash2, MessageSquare, Gavel } from "lucide-react";

export default function SharedWatchlists() {
  const { activeTeam } = useTeamContext();
  const { toast } = useToast();
  const [lists, setLists] = useState<SharedWatchlist[]>([]);
  const [active, setActive] = useState<SharedWatchlist | null>(null);
  const [items, setItems] = useState<SharedWatchlistItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!activeTeam) return;
    setLoading(true);
    Promise.all([listWatchlists(activeTeam.id), listDecisions(activeTeam.id)])
      .then(([w, d]) => { setLists(w); setDecisions(d); if (w[0]) setActive(w[0]); })
      .catch((e) => toast({ title: "Failed", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeTeam, toast]);

  useEffect(() => {
    if (!active) return setItems([]);
    listWatchlistItems(active.id).then(setItems);
  }, [active]);

  async function handleCreate() {
    if (!activeTeam || !newName.trim()) return;
    const w = await createWatchlist(activeTeam.id, newName.trim());
    setLists((p) => [w, ...p]);
    setActive(w);
    setNewName("");
  }

  if (!activeTeam) return <div className="p-8 text-muted-foreground">Select a team.</div>;
  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Shared Watchlists & Decisions</h1>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-2">
          <div className="flex gap-1">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list" />
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {lists.map((w) => (
            <Card
              key={w.id}
              className={`p-2 cursor-pointer ${active?.id === w.id ? "border-primary" : ""}`}
              onClick={() => setActive(w)}
            >
              <div className="text-sm font-medium">{w.name}</div>
              <div className="text-[11px] text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</div>
            </Card>
          ))}
          {lists.length === 0 && <div className="text-xs text-muted-foreground">No watchlists yet.</div>}
        </div>

        <div className="col-span-6 space-y-2">
          {active ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{active.name}</h2>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await deleteWatchlist(active.id);
                  setLists((p) => p.filter((x) => x.id !== active.id));
                  setActive(null);
                }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              {items.map((it) => (
                <ItemRow key={it.id} item={it} teamId={activeTeam.id} onRemove={async () => {
                  await removeWatchlistItem(it.id);
                  setItems((p) => p.filter((x) => x.id !== it.id));
                }} />
              ))}
              {items.length === 0 && <div className="text-xs text-muted-foreground">Empty. Add entities from the explorer.</div>}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Select or create a watchlist.</div>
          )}
        </div>

        <div className="col-span-3">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1"><Gavel className="h-4 w-4" /> Decision log</h3>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {decisions.map((d) => (
              <Card key={d.id} className="p-2">
                <div className="text-xs"><Badge variant="outline" className="mr-1 text-[10px]">{d.decision}</Badge>{d.entity_name}</div>
                {d.rationale && <div className="text-[11px] text-muted-foreground mt-1">{d.rationale}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(d.decided_at).toLocaleString()}</div>
              </Card>
            ))}
            {decisions.length === 0 && <div className="text-xs text-muted-foreground">No decisions logged.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, teamId, onRemove }: { item: SharedWatchlistItem; teamId: string; onRemove: () => void }) {
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CollabComment[]>([]);
  const [body, setBody] = useState("");
  const [decisionRationale, setDecisionRationale] = useState("");

  async function loadComments() {
    const c = await listComments(teamId, "watchlist_item", item.id);
    setComments(c);
  }

  async function postComment() {
    if (!body.trim()) return;
    const c = await addComment(teamId, "watchlist_item", item.id, body.trim());
    setComments((p) => [...p, c]);
    setBody("");
  }

  async function makeDecision(decision: "pursue" | "pass") {
    await logDecision({
      team_id: teamId,
      entity_type: item.entity_type,
      entity_key: item.entity_key,
      entity_name: item.entity_name,
      decision,
      rationale: decisionRationale.trim() || null,
    });
    setDecisionRationale("");
    toast({ title: `Decision logged: ${decision}` });
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{item.entity_name}</div>
          <div className="text-xs text-muted-foreground capitalize">{item.entity_type}</div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { setShowComments((s) => !s); if (!showComments) loadComments(); }}>
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
      {showComments && (
        <div className="space-y-2 pt-2 border-t">
          {comments.map((c) => (
            <div key={c.id} className="text-xs p-2 rounded bg-muted/30">{c.body}</div>
          ))}
          <div className="flex gap-1">
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comment…" className="text-xs" />
            <Button size="sm" onClick={postComment} disabled={!body.trim()}>Post</Button>
          </div>
          <div className="flex gap-1 pt-2 border-t">
            <Input value={decisionRationale} onChange={(e) => setDecisionRationale(e.target.value)} placeholder="Decision rationale…" className="text-xs" />
            <Button size="sm" variant="outline" onClick={() => makeDecision("pursue")}>Pursue</Button>
            <Button size="sm" variant="outline" onClick={() => makeDecision("pass")}>Pass</Button>
          </div>
        </div>
      )}
    </Card>
  );
}