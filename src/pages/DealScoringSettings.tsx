import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Info, Sliders, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDealScoringSettings, DEFAULT_WEIGHTS, DealScoringWeights, DEAL_SCORE_THRESHOLDS } from "@/hooks/useDealScoringSettings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WEIGHT_META: { key: keyof DealScoringWeights; label: string; description: string }[] = [
  { key: "streaming_weight", label: "Streaming Metrics", description: "How much monthly listeners, total streams, and streaming velocity influence the score." },
  { key: "social_weight", label: "Social Metrics", description: "How much follower count, engagement rate, and social growth impact the score." },
  { key: "catalog_depth_weight", label: "Catalog Depth", description: "How much the number of songs, release consistency, and back-catalog size matter." },
  { key: "deal_stage_weight", label: "Deal Stage", description: "How much the current pipeline stage (Reached Out, In Talks, etc.) affects the score." },
  { key: "priority_weight", label: "Manual Priority", description: "How much your 'Mark as priority' star flag boosts the score." },
];

export default function DealScoringSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { weights, setWeights, save, loading, saving, totalWeight } = useDealScoringSettings();
  const [localWeights, setLocalWeights] = useState<DealScoringWeights | null>(null);

  const w = localWeights ?? weights;
  const total = (localWeights ?? weights).streaming_weight + (localWeights ?? weights).social_weight + (localWeights ?? weights).catalog_depth_weight + (localWeights ?? weights).deal_stage_weight + (localWeights ?? weights).priority_weight;

  const updateWeight = (key: keyof DealScoringWeights, value: number) => {
    setLocalWeights(prev => ({ ...(prev ?? weights), [key]: value }));
  };

  const handleSave = async () => {
    if (!localWeights) return;
    await save(localWeights);
    toast({ title: "Scoring settings saved", description: "Deal Scores will use your new weights on next refresh." });
    setLocalWeights(null);
  };

  const handleReset = () => {
    setLocalWeights({ ...DEFAULT_WEIGHTS });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">Loading settings…</div>;
  }

  const formulaParts = WEIGHT_META.map(m => {
    const val = w[m.key];
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `${pct}% × ${m.label}`;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" />
              Deal Scoring Settings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Control how Publisting ranks and prioritizes your deals</p>
          </div>
        </div>

        {/* Explanation */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-foreground font-medium">How Deal Scoring Works</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Deal Score controls how Publisting ranks and prioritizes your deals. Adjust the sliders below to change how much each factor matters. Higher values mean that factor has more influence on the final score.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weight sliders */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Factor Weights</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={total === 100 ? "default" : "outline"} className="text-[10px]">
                  Total: {total}/100
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleReset}>
                  <RotateCcw className="w-3 h-3" /> Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {WEIGHT_META.map(meta => (
              <div key={meta.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{meta.label}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px] text-xs">
                        {meta.description}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Badge variant="outline" className="text-xs tabular-nums min-w-[40px] justify-center">
                    {w[meta.key]}
                  </Badge>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[w[meta.key]]}
                  onValueChange={([v]) => updateWeight(meta.key, v)}
                  className="w-full"
                />
              </div>
            ))}

            {total !== 100 && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Weights don't need to total 100 — they'll be normalized automatically. But 100 makes it easier to think in percentages.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Thresholds info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Score Buckets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-center">
                <p className="text-lg font-bold text-red-400">Low</p>
                <p className="text-[10px] text-muted-foreground">&lt; {DEAL_SCORE_THRESHOLDS.medium}</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                <p className="text-lg font-bold text-amber-400">Medium</p>
                <p className="text-[10px] text-muted-foreground">{DEAL_SCORE_THRESHOLDS.medium}–{DEAL_SCORE_THRESHOLDS.high - 1}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">High</p>
                <p className="text-[10px] text-muted-foreground">{DEAL_SCORE_THRESHOLDS.high}+</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              These thresholds drive the Deal Score summary widget and the bucket labels on watchlist cards.
            </p>
          </CardContent>
        </Card>

        {/* Formula summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">How It's Calculated</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your Deal Score = {formulaParts.join(" + ")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Each factor is measured on a 0–1 scale internally, then multiplied by its weight and summed to produce a score out of 100.
            </p>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!localWeights || saving} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save Scoring Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
