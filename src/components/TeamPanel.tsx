import { useState } from "react";
import { Users, Plus, Trash2, Mail, UserPlus, Crown, LogIn, User, Pen, Disc3, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTeams, Team, TeamFavorite } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

const roleIcons = { artist: User, writer: Pen, producer: Disc3 };
const roleLabels = { artist: "Artist", writer: "Writer", producer: "Producer" };

interface TeamPanelProps {
  onClose: () => void;
}

export const TeamPanel = ({ onClose }: TeamPanelProps) => {
  const { user } = useAuth();
  const {
    teams, activeTeam, setActiveTeam, members, teamFavorites, invites, pendingInvites,
    createTeam, deleteTeam, inviteMember, acceptInvite, removeMember, removeTeamFavorite,
    reorderTeamFavorites,
  } = useTeams();

  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateTeam = async () => {
    const team = await createTeam(newTeamName);
    if (team) {
      setNewTeamName("");
      setShowCreateForm(false);
      setActiveTeam(team);
    }
  };

  const handleInvite = async () => {
    if (activeTeam) {
      await inviteMember(activeTeam.id, inviteEmail);
      setInviteEmail("");
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...teamFavorites];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reorderTeamFavorites(reordered);
  };

  const isOwner = members.some(m => m.user_id === user?.id && m.role === "owner");

  if (!user) {
    return (
      <div className="glass rounded-2xl p-6 max-w-3xl mx-auto text-center">
        <p className="text-muted-foreground">Sign in to use team features.</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">Close</Button>
      </div>
    );
  }

  // Team detail view
  if (activeTeam) {
    return (
      <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveTeam(null)}>← Back</Button>
            <h2 className="font-display text-xl font-semibold text-foreground">{activeTeam.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button variant="destructive" size="sm" onClick={() => { deleteTeam(activeTeam.id); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete Team
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>

        {/* Members Section */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Members ({members.length})
          </h3>
          <div className="space-y-2 mb-3">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2">
                  {m.role === "owner" ? <Crown className="w-4 h-4 text-amber-400" /> : <User className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm text-foreground">{m.invited_email || (m.user_id === user?.id ? "You" : m.user_id.slice(0, 8))}</span>
                  <Badge variant="secondary" className="text-xs">{m.role}</Badge>
                </div>
                {isOwner && m.user_id !== user?.id && (
                  <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Pending Invites */}
          {invites.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">Pending Invites:</p>
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <Mail className="w-3 h-3" /> {inv.email}
                </div>
              ))}
            </div>
          )}

          {/* Invite Form */}
          {isOwner && (
            <div className="flex gap-2">
              <Input
                placeholder="Email address to invite..."
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleInvite} disabled={!inviteEmail.trim()}>
                <UserPlus className="w-4 h-4 mr-1" /> Invite
              </Button>
            </div>
          )}
        </div>

        {/* Shared Favorites */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Shared Favorites ({teamFavorites.length})
          </h3>
          {teamFavorites.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              No shared favorites yet. Search for a song and add credits to this team's list.
            </p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="team-favorites">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {teamFavorites.map((fav, i) => {
                      const Icon = roleIcons[fav.role as keyof typeof roleIcons] || User;
                      return (
                        <Draggable key={fav.id} draggableId={fav.id} index={i}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`glass glass-hover rounded-xl p-3 flex items-center gap-3 ${snap.isDragging ? "ring-2 ring-primary/50" : ""}`}
                            >
                              <div {...prov.dragHandleProps} className="cursor-grab text-muted-foreground">
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                                <Icon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-foreground text-sm">{fav.name}</span>
                                <div className="flex gap-1 mt-0.5">
                                  <Badge variant="secondary" className="text-xs">{roleLabels[fav.role as keyof typeof roleLabels]}</Badge>
                                  {fav.pro && <Badge variant="outline" className="text-xs">{fav.pro}</Badge>}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => removeTeamFavorite(fav.id)}>
                                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>
    );
  }

  // Teams list view
  return (
    <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Teams</h2>
            <p className="text-sm text-muted-foreground">Share favorites with your team</p>
          </div>
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Pending Invitations
          </h3>
          {pendingInvites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 mb-2">
              <span className="text-sm text-foreground">{inv.teamName || "Team"}</span>
              <Button size="sm" onClick={() => acceptInvite(inv)}>
                <LogIn className="w-4 h-4 mr-1" /> Join
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Teams List */}
      <div className="space-y-2 mb-4">
        {teams.map(team => (
          <button
            key={team.id}
            onClick={() => setActiveTeam(team)}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border/50 hover:border-primary/30 hover:bg-secondary transition-colors text-left"
          >
            <Users className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-foreground">{team.name}</p>
              <p className="text-xs text-muted-foreground">Created {new Date(team.created_at).toLocaleDateString()}</p>
            </div>
          </button>
        ))}
        {teams.length === 0 && !showCreateForm && (
          <p className="text-center text-muted-foreground py-6 text-sm">No teams yet. Create one to start sharing favorites.</p>
        )}
      </div>

      {/* Create Team */}
      {showCreateForm ? (
        <div className="flex gap-2">
          <Input
            placeholder="Team name..."
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
            maxLength={100}
            autoFocus
          />
          <Button onClick={handleCreateTeam} disabled={!newTeamName.trim()}>Create</Button>
          <Button variant="ghost" onClick={() => { setShowCreateForm(false); setNewTeamName(""); }}>Cancel</Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Create Team
        </Button>
      )}
    </div>
  );
};
