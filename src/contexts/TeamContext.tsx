import { createContext, useContext, useEffect, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTeams, Team, TeamMember } from "@/hooks/useTeams";

interface TeamContextType {
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  teams: Team[];
  members: TeamMember[];
  isLoading: boolean;
  currentUserRole: "owner" | "member" | null;
  currentUserId: string | null;
}

const TeamContext = createContext<TeamContextType>({
  activeTeam: null,
  setActiveTeam: () => {},
  teams: [],
  members: [],
  isLoading: true,
  currentUserRole: null,
  currentUserId: null,
});

export const useTeamContext = () => useContext(TeamContext);

export const TeamProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { teams, activeTeam, setActiveTeam, members, isLoading } = useTeams();

  // Auto-select first team if user has teams but none selected
  useEffect(() => {
    if (!activeTeam && teams.length > 0) {
      setActiveTeam(teams[0]);
    }
  }, [teams, activeTeam, setActiveTeam]);

  const resolvedActiveTeam = activeTeam || teams[0] || null;

  const currentUserRole = user && members.length > 0
    ? (members.find((m) => m.user_id === user.id)?.role as "owner" | "member") || null
    : null;

  return (
    <TeamContext.Provider value={{
      activeTeam: resolvedActiveTeam,
      setActiveTeam,
      teams,
      members,
      isLoading,
      currentUserRole,
      currentUserId: user?.id || null,
    }}>
      {children}
    </TeamContext.Provider>
  );
};
