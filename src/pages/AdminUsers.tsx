import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Download, Users, Clock, Filter, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface Profile {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string;
  display_name: string | null;
}

const AdminUsers = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-user-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-list-profiles");
      if (error) throw error;
      return (data as { profiles: Profile[] }).profiles;
    },
    enabled: !!user,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-muted-foreground">You need to be signed in to view user data.</p>
          <Link to="/auth">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  const providers = [...new Set((profiles ?? []).map(p => p.provider || "email"))];

  const filtered = (profiles ?? []).filter((p) => {
    const q = filter.toLowerCase();
    const matchesText = !q || 
      (p.email?.toLowerCase().includes(q)) || 
      (p.display_name?.toLowerCase().includes(q));
    const matchesProvider = providerFilter === "all" || p.provider === providerFilter;
    return matchesText && matchesProvider;
  });

  const providerCounts = (profiles ?? []).reduce<Record<string, number>>((acc, p) => {
    const prov = p.provider || "email";
    acc[prov] = (acc[prov] || 0) + 1;
    return acc;
  }, {});

  // Signups in the last 7 days
  const recentCount = (profiles ?? []).filter(p => {
    const d = new Date(p.created_at);
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const exportCsv = () => {
    const rows = [["Display Name", "Email", "Provider", "Signed Up", "Last Sign In"]];
    filtered.forEach((p) => {
      rows.push([
        p.display_name || "",
        p.email || "",
        p.provider || "email",
        new Date(p.created_at).toLocaleDateString(),
        p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleDateString() : "Never",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">User Signups</h1>
              <p className="text-sm text-muted-foreground">
                {profiles?.length ?? 0} total users
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/signups">
              <Button variant="outline" size="sm" className="gap-2">
                <Users className="w-4 h-4" />
                Beta Signups
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{profiles?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{recentCount}</p>
            <p className="text-xs text-muted-foreground">Last 7 Days</p>
          </div>
          {Object.entries(providerCounts).map(([prov, count]) => (
            <div key={prov} className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground capitalize">{prov}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by name or email..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    Email
                  </th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Signed Up
                  </th>
                  <th className="px-4 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{p.display_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.email || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs capitalize">
                        {p.provider || "email"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {p.last_sign_in_at
                        ? new Date(p.last_sign_in_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;
