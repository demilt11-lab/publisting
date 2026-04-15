import { useState, useEffect } from "react";
import { Shield, Plus, Clock, User, FileText, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DealRoomPanelProps {
  entryId: string;
  teamId: string;
  personName: string;
}

interface NoteEntry {
  id: string;
  text: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export function DealRoomPanel({ entryId, teamId, personName }: DealRoomPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRoom();
  }, [entryId, teamId]);

  const loadRoom = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("deal_rooms")
      .select("*")
      .eq("entry_id", entryId)
      .eq("team_id", teamId)
      .maybeSingle();
    setRoom(data);
    setLoading(false);
  };

  const createRoom = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("deal_rooms")
      .insert({
        entry_id: entryId,
        team_id: teamId,
        title: `Deal Room: ${personName}`,
        created_by: user.id,
        notes_history: [],
        documents: [],
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Failed to create deal room", variant: "destructive" });
    } else {
      setRoom(data);
      toast({ title: "Deal room created" });
    }
    setSaving(false);
  };

  const addNote = async () => {
    if (!newNote.trim() || !user || !room) return;
    setSaving(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const noteEntry: NoteEntry = {
      id: crypto.randomUUID(),
      text: newNote.trim(),
      author_id: user.id,
      author_name: profile?.display_name || user.email?.split("@")[0] || "Unknown",
      created_at: new Date().toISOString(),
    };

    const updatedHistory = [...(room.notes_history || []), noteEntry];

    const { error } = await supabase
      .from("deal_rooms")
      .update({ notes_history: updatedHistory })
      .eq("id", room.id);

    if (error) {
      toast({ title: "Failed to add note", variant: "destructive" });
    } else {
      setRoom({ ...room, notes_history: updatedHistory });
      setNewNote("");
    }
    setSaving(false);
  };

  const notes: NoteEntry[] = room?.notes_history || [];

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!room) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 text-center space-y-2">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">No deal room exists for this entry</p>
          <Button size="sm" onClick={createRoom} disabled={saving} className="h-7 text-xs">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
            Create Deal Room
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Deal Room
          </CardTitle>
          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0",
            room.status === "active" ? "border-emerald-500/30 text-emerald-400" : "border-muted text-muted-foreground"
          )}>
            {room.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Notes Timeline */}
        <ScrollArea className="max-h-48">
          <div className="space-y-2">
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No notes yet. Start the conversation.</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="p-2 rounded-lg bg-muted/10 border border-border/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <User className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-foreground">{note.author_name}</span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-2 h-2" />
                    {new Date(note.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{note.text}</p>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Add Note */}
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="min-h-[60px] text-xs resize-none"
            onKeyDown={e => { if (e.key === "Enter" && e.metaKey) addNote(); }}
          />
        </div>
        <Button size="sm" onClick={addNote} disabled={saving || !newNote.trim()} className="w-full h-7 text-xs">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
          Add Note
        </Button>

        {/* Documents Section */}
        {(room.documents || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Documents
            </p>
            <div className="space-y-1">
              {(room.documents as any[]).map((doc: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/10">
                  <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{doc.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
