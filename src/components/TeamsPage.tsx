import { useState, useMemo } from "react";
import { Users, Crown, User, ChevronDown, UserPlus, Trash2, ArrowRight, Mail, Shield, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTeamContext } from "@/contexts/TeamContext";
import { useTeams } from "@/hooks/useTeams";
import { useWatchlist, ContactStatus, CONTACT_STATUS_CONFIG } from "@/hooks/useWatchlist";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TeamsPageProps {
  onClose: () => void;
  onNavigateToPipeline?: (assigneeFilter: string) => void;
}

const STATUSES: ContactStatus[] = ["not_contacted", "watching", "reached_out", "in_talks", "signed", "passed", "no_response"];

export const TeamsPage = ({ onClose, onNavigateToPipeline }: TeamsPageProps) => {
  const { user } = useAuth();
  const { activeTeam, setActiveTeam, teams, members, currentUserRole } = useTeamContext();
  const { inviteMember, removeMember, deleteTeam, createTeam } = useTeams();
  const { watchlist } = useWatchlist();
  const [inviteEmail, setInviteEmail] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const isAdmin = currentUserRole === "owner";

  // Assignment counts per member per status
  const assignmentOverview = useMemo(() => {
    const overview: Record<string, Record<ContactStatus, number>> = {};
    // Init for all members
    members.forEach(m => {
      overview[m.user_id] = { not_contacted: 0, watching: 0, reached_out: 0, in_talks: 0, signed: 0, passed: 0, no_response: 0 };
    });
    // Add unassigned bucket
    overview["unassigned"] = { not_contacted: 0, watching: 0, reached_out: 0, in_talks: 0, signed: 0, passed: 0, no_response: 0 };

    watchlist.forEach(entry => {
      const key = entry.assignedToUserId || "unassigned";
      if (!overview[key]) overview[key] = { not_contacted: 0, watching: 0, reached_out: 0, in_talks: 0, signed: 0, passed: 0, no_response: 0 };
      const status = entry.contactStatus || "not_contacted";
      overview[key][status]++;
    });
    return overview;
  }, [members, watchlist]);

  const getMemberAssignedCount = (userId: string) => {
    const counts = assignmentOverview[userId];
    if (!counts) return 0;
    return Object.values(counts).reduce((a, b) => a + b, 0);
  };

  const handleInvite = async () => {
    if (!activeTeam || !inviteEmail.trim()) return;
    await inviteMember(activeTeam.id, inviteEmail);
    setInviteEmail("");
  };

  const handleCreateTeam = async () => {
    const team = await createTeam(newTeamName);
    if (team) {
      setNewTeamName("");
      setShowCreateForm(false);
      setActiveTeam(team);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl border border-border/50 bg-card p-12 text-center space-y-3">
          <Users className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-foreground font-medium">Sign in to access Teams</p>
          <p className="text-sm text-muted-foreground">Teams let you collaborate with your A&R team on a shared watchlist and pipeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Teams</h1>
            <p className="text-xs text-muted-foreground">Manage members and see who owns what</p>
          </div>
        </div>
      </div>

      {/* ─── 2.1 Active Team Selector ─── */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Team</h2>
        <div className="flex items-center gap-3">
          <Select
            value={activeTeam?.id || ""}
            onValueChange={(id) => {
              const team = teams.find(t => t.id === id);
              if (team) setActiveTeam(team);
            }}
          >
            <SelectTrigger className="flex-1 h-10">
              <SelectValue placeholder="Select a team..." />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!showCreateForm ? (
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)} className="shrink-0 gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> New Team
            </Button>
          ) : (
            <div className="flex gap-2 shrink-0">
              <Input
                placeholder="Team name..."
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
                className="w-40"
                autoFocus
              />
              <Button size="sm" onClick={handleCreateTeam} disabled={!newTeamName.trim()}>Create</Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreateForm(false); setNewTeamName(""); }}>Cancel</Button>
            </div>
          )}
        </div>
        {activeTeam && (
          <p className="text-xs text-muted-foreground">
            {watchlist.length} people tracked · {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ─── 2.2 Team Members & Roles ─── */}
      {activeTeam && (
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Team Members ({members.length})
            </h2>
            {isAdmin && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Admin</Badge>
            )}
          </div>

          <div className="divide-y divide-border/50">
            {members.map(m => {
              const assignedCount = getMemberAssignedCount(m.user_id);
              const isCurrentUser = m.user_id === user?.id;
              return (
                <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {m.role === "owner" ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {m.invited_email || (isCurrentUser ? "You" : m.user_id.slice(0, 8))}
                      </span>
                      {isCurrentUser && <Badge variant="secondary" className="text-[9px]">You</Badge>}
                      <Badge variant="outline" className={cn("text-[9px]", m.role === "owner" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "")}>
                        {m.role === "owner" ? "Admin" : "Member"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {assignedCount} assigned
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {assignedCount > 0 && onNavigateToPipeline && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] gap-1 text-primary"
                        onClick={() => onNavigateToPipeline(m.user_id)}
                      >
                        View assignments <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                    {isAdmin && !isCurrentUser && (
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => removeMember(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Invite form (admin only) */}
          {isAdmin && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex gap-2">
                <Input
                  placeholder="Invite by email..."
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleInvite} disabled={!inviteEmail.trim()} className="gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Invite
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 2.3 Assignment Overview ─── */}
      {activeTeam && members.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Assignment Overview
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Member</th>
                  {STATUSES.map(s => (
                    <th key={s} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">
                      {CONTACT_STATUS_CONFIG[s].label}
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const counts = assignmentOverview[m.user_id] || { not_contacted: 0, watching: 0, reached_out: 0, in_talks: 0, signed: 0, passed: 0, no_response: 0 };
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  const isCurrentUser = m.user_id === user?.id;
                  return (
                    <tr key={m.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-foreground">
                          {m.invited_email || (isCurrentUser ? "You" : m.user_id.slice(0, 8))}
                        </span>
                      </td>
                      {STATUSES.map(s => (
                        <td key={s} className="text-center py-2.5 px-2">
                          {counts[s] > 0 ? (
                            <Badge variant="outline" className={cn("text-[9px] font-mono", CONTACT_STATUS_CONFIG[s].color)}>
                              {counts[s]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/40">–</span>
                          )}
                        </td>
                      ))}
                      <td className="text-center py-2.5 pl-2">
                        <span className="text-foreground font-semibold font-mono">{total}</span>
                      </td>
                    </tr>
                  );
                })}
                {/* Unassigned row */}
                {(() => {
                  const counts = assignmentOverview["unassigned"] || { not_contacted: 0, watching: 0, reached_out: 0, in_talks: 0, signed: 0, passed: 0, no_response: 0 };
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  if (total === 0) return null;
                  return (
                    <tr className="border-t border-border/50 bg-muted/20">
                      <td className="py-2.5 pr-3">
                        <span className="text-muted-foreground italic">Unassigned</span>
                      </td>
                      {STATUSES.map(s => (
                        <td key={s} className="text-center py-2.5 px-2">
                          {counts[s] > 0 ? (
                            <Badge variant="outline" className="text-[9px] font-mono">{counts[s]}</Badge>
                          ) : (
                            <span className="text-muted-foreground/40">–</span>
                          )}
                        </td>
                      ))}
                      <td className="text-center py-2.5 pl-2">
                        <span className="text-muted-foreground font-mono">{total}</span>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No teams state */}
      {teams.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">No teams yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create a team to start collaborating with your A&R colleagues on a shared watchlist and pipeline.
          </p>
        </div>
      )}
    </div>
  );
};
