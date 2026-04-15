import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DataConflict {
  id: string;
  song_title: string;
  song_artist: string;
  field_name: string;
  source_1: string;
  value_1: string;
  confidence_1: number;
  source_2: string;
  value_2: string;
  confidence_2: number;
  resolved_value: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  status: string;
  created_at: string;
}

const AdminDataConflicts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("unresolved");

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ["data-conflicts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_conflicts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as DataConflict[];
    },
    enabled: !!user,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolvedValue }: { id: string; resolvedValue: string }) => {
      const { error } = await supabase
        .from("data_conflicts")
        .update({
          resolved_value: resolvedValue,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
          status: "resolved",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-conflicts"] });
      toast({ title: "Conflict resolved" });
    },
  });

  const unresolvedConflicts = conflicts.filter((c) => c.status === "unresolved");
  const resolvedConflicts = conflicts.filter((c) => c.status === "resolved");

  const confidenceColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
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
          <h1 className="text-2xl font-bold text-foreground">Data Conflict Resolution</h1>
          <p className="text-sm text-muted-foreground">
            Review and resolve disagreements between data sources
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant="outline" className="border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {unresolvedConflicts.length} unresolved
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {resolvedConflicts.length} resolved
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="unresolved">
            Unresolved ({unresolvedConflicts.length})
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved ({resolvedConflicts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unresolved" className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading conflicts...</p>
          ) : unresolvedConflicts.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="py-12 text-center">
                <Shield className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-muted-foreground">No unresolved conflicts — data is clean!</p>
              </CardContent>
            </Card>
          ) : (
            unresolvedConflicts.map((conflict) => (
              <Card key={conflict.id} className="border-amber-500/20">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {conflict.song_title} — {conflict.song_artist}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {conflict.field_name}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-3 rounded-lg bg-card border border-border/40">
                      <p className="text-xs text-muted-foreground mb-1">{conflict.source_1}</p>
                      <p className="text-sm font-medium text-foreground">{conflict.value_1}</p>
                      <p className={`text-xs mt-1 ${confidenceColor(conflict.confidence_1)}`}>
                        {conflict.confidence_1}% confidence
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-card border border-border/40">
                      <p className="text-xs text-muted-foreground mb-1">{conflict.source_2}</p>
                      <p className="text-sm font-medium text-foreground">{conflict.value_2}</p>
                      <p className={`text-xs mt-1 ${confidenceColor(conflict.confidence_2)}`}>
                        {conflict.confidence_2}% confidence
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate({ id: conflict.id, resolvedValue: conflict.value_1 })}
                      disabled={resolveMutation.isPending}
                    >
                      Use {conflict.source_1}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate({ id: conflict.id, resolvedValue: conflict.value_2 })}
                      disabled={resolveMutation.isPending}
                    >
                      Use {conflict.source_2}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-3">
          {resolvedConflicts.length === 0 ? (
            <Card className="border-border/40">
              <CardContent className="py-12 text-center">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No resolved conflicts yet</p>
              </CardContent>
            </Card>
          ) : (
            resolvedConflicts.map((conflict) => (
              <Card key={conflict.id} className="border-border/40 opacity-80">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {conflict.song_title} — {conflict.song_artist}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conflict.field_name}: resolved to "{conflict.resolved_value}"
                      </p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      Resolved
                    </Badge>
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

export default AdminDataConflicts;
