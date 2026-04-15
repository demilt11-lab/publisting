import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Target, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PredictionRecord {
  id: string;
  prediction_type: string;
  entity_name: string;
  predicted_value: Record<string, any>;
  predicted_date: string | null;
  actual_value: Record<string, any> | null;
  actual_date: string | null;
  accuracy_percentage: number | null;
  genre: string | null;
  region: string | null;
  notes: string | null;
  created_at: string;
}

const AdminAccuracy = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ["prediction-tracking", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_tracking")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as PredictionRecord[];
    },
    enabled: !!user,
  });

  const withAccuracy = predictions.filter((p) => p.accuracy_percentage !== null);
  const overallAccuracy = withAccuracy.length > 0
    ? withAccuracy.reduce((sum, p) => sum + (p.accuracy_percentage || 0), 0) / withAccuracy.length
    : 0;

  const byType = predictions.reduce<Record<string, PredictionRecord[]>>((acc, p) => {
    acc[p.prediction_type] = acc[p.prediction_type] || [];
    acc[p.prediction_type].push(p);
    return acc;
  }, {});

  const typeAccuracy = Object.entries(byType).map(([type, preds]) => {
    const scored = preds.filter((p) => p.accuracy_percentage !== null);
    const avg = scored.length > 0
      ? scored.reduce((s, p) => s + (p.accuracy_percentage || 0), 0) / scored.length
      : null;
    return { type, count: preds.length, scored: scored.length, accuracy: avg };
  });

  const genreAccuracy = withAccuracy.reduce<Record<string, { sum: number; count: number }>>((acc, p) => {
    const g = p.genre || "Unknown";
    acc[g] = acc[g] || { sum: 0, count: 0 };
    acc[g].sum += p.accuracy_percentage || 0;
    acc[g].count += 1;
    return acc;
  }, {});

  const accuracyColor = (pct: number) => {
    if (pct >= 80) return "text-emerald-400";
    if (pct >= 60) return "text-amber-400";
    return "text-red-400";
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prediction Accuracy</h1>
          <p className="text-sm text-muted-foreground">
            Track how accurate your ML predictions and valuations are
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-border/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Overall Accuracy</p>
            <p className={`text-2xl font-bold ${accuracyColor(overallAccuracy)}`}>
              {overallAccuracy > 0 ? `${overallAccuracy.toFixed(1)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Predictions</p>
            <p className="text-2xl font-bold text-foreground">{predictions.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Verified</p>
            <p className="text-2xl font-bold text-emerald-400">{withAccuracy.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending Verification</p>
            <p className="text-2xl font-bold text-amber-400">
              {predictions.length - withAccuracy.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">By Type</TabsTrigger>
          <TabsTrigger value="genre">By Genre</TabsTrigger>
          <TabsTrigger value="history">All Predictions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {typeAccuracy.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="py-12 text-center">
                <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No predictions tracked yet. Predictions are recorded automatically from trend
                  forecasts, deal scores, and catalog valuations.
                </p>
              </CardContent>
            </Card>
          ) : (
            typeAccuracy.map(({ type, count, scored, accuracy }) => (
              <Card key={type} className="border-border/40">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium capitalize">
                        {type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {scored}/{count} verified
                      </span>
                      {accuracy !== null && (
                        <Badge
                          className={`${
                            accuracy >= 80
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : accuracy >= 60
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}
                        >
                          {accuracy.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  {accuracy !== null && (
                    <Progress value={accuracy} className="h-1.5" />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="genre" className="space-y-3">
          {Object.keys(genreAccuracy).length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No genre-level accuracy data yet</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(genreAccuracy)
              .sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)
              .map(([genre, { sum, count }]) => {
                const avg = sum / count;
                return (
                  <Card key={genre} className="border-border/40">
                    <CardContent className="py-3 flex items-center justify-between">
                      <p className="text-sm font-medium">{genre}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{count} predictions</span>
                        <Badge className={`${accuracyColor(avg)} bg-transparent border`}>
                          {avg.toFixed(1)}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {predictions.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No prediction history</p>
              </CardContent>
            </Card>
          ) : (
            predictions.slice(0, 50).map((p) => (
              <Card key={p.id} className="border-border/40">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{p.entity_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {p.prediction_type.replace(/_/g, " ")} •{" "}
                        {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.accuracy_percentage !== null ? (
                        <>
                          {p.accuracy_percentage >= 70 ? (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                          )}
                          <span className={`text-sm font-medium ${accuracyColor(p.accuracy_percentage)}`}>
                            {p.accuracy_percentage.toFixed(0)}%
                          </span>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs">Pending</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAccuracy;
