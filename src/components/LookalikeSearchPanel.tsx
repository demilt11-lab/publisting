import { useState } from "react";
import { Search, Users, Loader2, TrendingUp, Music, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface LookalikeResult {
  artist: string;
  title: string;
  similarity_score: number;
  matching_features: string[];
  popularity: number;
  genre: string[];
  region?: string;
  career_stage: string;
}

export function LookalikeSearchPanel() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LookalikeResult[]>([]);
  const [sourceFeatures, setSourceFeatures] = useState<any>(null);

  const runSearch = async () => {
    if (!query.trim() || !user) return;
    setLoading(true);
    setResults([]);

    try {
      // Find source artist's songs to build feature profile
      const { data: sourceSongs } = await supabase
        .from("ml_song_candidates")
        .select("*")
        .ilike("artist", `%${query.trim()}%`)
        .limit(20);

      if (!sourceSongs || sourceSongs.length === 0) {
        setLoading(false);
        return;
      }

      // Build average feature profile
      const avgFeatures = {
        danceability: avg(sourceSongs, "danceability"),
        energy: avg(sourceSongs, "energy"),
        valence: avg(sourceSongs, "valence"),
        acousticness: avg(sourceSongs, "acousticness"),
        tempo: avg(sourceSongs, "tempo"),
        instrumentalness: avg(sourceSongs, "instrumentalness"),
        popularity: avg(sourceSongs, "popularity"),
        genres: [...new Set(sourceSongs.flatMap(s => s.genre || []))],
        regions: [...new Set(sourceSongs.map(s => s.region).filter(Boolean))],
      };
      setSourceFeatures(avgFeatures);

      // Find similar candidates using cosine-like scoring
      const { data: allCandidates } = await supabase
        .from("ml_song_candidates")
        .select("*")
        .not("artist", "ilike", `%${query.trim()}%`)
        .limit(500);

      if (!allCandidates) { setLoading(false); return; }

      const scored = allCandidates.map(c => {
        const features: string[] = [];
        let score = 0;
        let weights = 0;

        // Audio feature similarity (weighted euclidean)
        const audioSim = 1 - Math.sqrt(
          Math.pow((c.danceability || 0) - avgFeatures.danceability, 2) * 0.2 +
          Math.pow((c.energy || 0) - avgFeatures.energy, 2) * 0.2 +
          Math.pow((c.valence || 0) - avgFeatures.valence, 2) * 0.15 +
          Math.pow((c.acousticness || 0) - avgFeatures.acousticness, 2) * 0.15 +
          Math.pow(((c.tempo || 120) - (avgFeatures.tempo || 120)) / 200, 2) * 0.1 +
          Math.pow((c.instrumentalness || 0) - avgFeatures.instrumentalness, 2) * 0.1
        );
        score += audioSim * 40; weights += 40;
        if (audioSim > 0.7) features.push("Similar sound");

        // Genre overlap
        const cGenres = c.genre || [];
        const genreOverlap = cGenres.filter((g: string) => avgFeatures.genres.includes(g)).length;
        const genreScore = avgFeatures.genres.length > 0 ? genreOverlap / avgFeatures.genres.length : 0;
        score += genreScore * 30; weights += 30;
        if (genreScore > 0.5) features.push("Genre match");

        // Career stage (popularity band matching)
        const popDiff = Math.abs((c.popularity || 0) - avgFeatures.popularity);
        const popScore = Math.max(0, 1 - popDiff / 50);
        score += popScore * 20; weights += 20;
        if (popScore > 0.7) features.push("Similar career stage");

        // Region match
        if (c.region && avgFeatures.regions.includes(c.region)) {
          score += 10; features.push("Same region");
        }
        weights += 10;

        const normalizedScore = weights > 0 ? score / weights : 0;

        // Determine career stage label
        const pop = c.popularity || 0;
        const careerStage = pop > 70 ? "Established" : pop > 40 ? "Rising" : pop > 20 ? "Emerging" : "Underground";

        return {
          artist: c.artist,
          title: c.title,
          similarity_score: Math.round(normalizedScore * 100),
          matching_features: features,
          popularity: pop,
          genre: cGenres,
          region: c.region,
          career_stage: careerStage,
        } as LookalikeResult;
      });

      // Deduplicate by artist, take highest score
      const byArtist = new Map<string, LookalikeResult>();
      scored.forEach(s => {
        const existing = byArtist.get(s.artist);
        if (!existing || s.similarity_score > existing.similarity_score) {
          byArtist.set(s.artist, s);
        }
      });

      const topResults = [...byArtist.values()]
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, 15);

      setResults(topResults);

      // Save search
      await supabase.from("lookalike_searches" as any).insert({
        user_id: user.id,
        source_artist: query.trim(),
        source_features: avgFeatures,
        results: topResults.slice(0, 10),
        filters_used: {},
      } as any);
    } catch (e) {
      console.error("Lookalike search failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Lookalike Artist Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Enter artist name..."
            className="h-8 text-xs"
            onKeyDown={e => e.key === "Enter" && runSearch()}
          />
          <Button size="sm" onClick={runSearch} disabled={loading || !query.trim()} className="h-8 text-xs shrink-0">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          </Button>
        </div>

        {sourceFeatures && (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              <Music className="w-2.5 h-2.5 mr-0.5" />
              {sourceFeatures.genres.slice(0, 3).join(", ") || "Unknown genre"}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              Pop: {Math.round(sourceFeatures.popularity)}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              Energy: {sourceFeatures.energy.toFixed(2)}
            </Badge>
          </div>
        )}

        {results.length > 0 && (
          <ScrollArea className="max-h-72">
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={`${r.artist}-${i}`} className="flex items-center gap-2 p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {r.similarity_score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.artist}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {r.matching_features.map(f => (
                        <Badge key={f} variant="outline" className="text-[8px] px-1 py-0 border-primary/20 text-primary/80">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0",
                      r.career_stage === "Emerging" ? "border-emerald-500/30 text-emerald-400" :
                      r.career_stage === "Rising" ? "border-blue-500/30 text-blue-400" :
                      r.career_stage === "Underground" ? "border-purple-500/30 text-purple-400" :
                      "border-amber-500/30 text-amber-400"
                    )}>
                      {r.career_stage}
                    </Badge>
                    {r.region && (
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-end gap-0.5">
                        <MapPin className="w-2 h-2" />{r.region}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {results.length === 0 && !loading && sourceFeatures && (
          <p className="text-xs text-muted-foreground text-center py-4">No similar artists found in database</p>
        )}
      </CardContent>
    </Card>
  );
}

function avg(arr: any[], key: string): number {
  const vals = arr.map(a => a[key]).filter(v => v != null);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
