import { useState, useEffect } from "react";
import { Users, Plus, X, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ArtistAliasPanelProps {
  personId?: string;
  artistName: string;
}

interface Alias {
  id: string;
  alias_name: string;
  alias_type: string;
  source: string;
  confidence: number;
}

// Simple phonetic matching (Soundex-like)
function soundex(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  const codes: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };
  let result = s[0];
  let lastCode = codes[s[0]] || "0";
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || "0";
    if (code !== "0" && code !== lastCode) {
      result += code;
    }
    lastCode = code;
  }
  return result.padEnd(4, "0");
}

export function ArtistAliasPanel({ personId, artistName }: ArtistAliasPanelProps) {
  const { toast } = useToast();
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    supabase
      .from("artist_aliases" as any)
      .select("*")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAliases((data as any as Alias[]) || []);
        setLoading(false);
      });
  }, [personId]);

  const addAlias = async () => {
    if (!personId || !newAlias.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("artist_aliases" as any)
        .insert({
          person_id: personId,
          alias_name: newAlias.trim(),
          alias_type: "aka",
          source: "manual",
          confidence: 1.0,
        } as any)
        .select()
        .single();
      if (error) throw error;
      setAliases(prev => [data as any as Alias, ...prev]);
      setNewAlias("");
      toast({ title: "Alias added" });
    } catch (err: any) {
      toast({ title: "Failed to add alias", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const removeAlias = async (id: string) => {
    await supabase.from("artist_aliases" as any).delete().eq("id", id);
    setAliases(prev => prev.filter(a => a.id !== id));
  };

  const phoneticCode = soundex(artistName);

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Known Aliases
          <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0">
            Soundex: {phoneticCode}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="Add alias name..."
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === "Enter" && addAlias()}
          />
          <Button size="sm" onClick={addAlias} disabled={adding || !newAlias.trim()} className="h-7 px-2">
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        {aliases.length > 0 && (
          <div className="space-y-1">
            {aliases.map((alias) => (
              <div key={alias.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{alias.alias_name}</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0">{alias.alias_type}</Badge>
                  {alias.source !== "manual" && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 opacity-60">{alias.source}</Badge>
                  )}
                </div>
                <button onClick={() => removeAlias(alias.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {aliases.length === 0 && !loading && (
          <p className="text-[10px] text-muted-foreground">
            No aliases found. Add alternate names, real names, or non-Latin script versions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
