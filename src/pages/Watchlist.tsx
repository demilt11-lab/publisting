import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WatchlistView } from "@/components/WatchlistView";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { SeoHead } from "@/components/seo/SeoHead";
import { AlertTriangle } from "lucide-react";
import { useTeamContext } from "@/contexts/TeamContext";
import { listOverdueFollowUps } from "@/lib/api/outreachCrm";

const Watchlist = () => {
  const navigate = useNavigate();
  const { activeTeam } = useTeamContext();
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (!activeTeam) return;
    listOverdueFollowUps(activeTeam.id)
      .then((rows) => setOverdueCount(rows.length))
      .catch(() => setOverdueCount(0));
  }, [activeTeam]);

  return (
    <ErrorBoundary fallbackTitle="Watchlist failed to load">
      <SeoHead
        title="Watchlist"
        description="Track artists, writers and tracks on your Publisting watchlist. Monitor publishing changes, credits and deal opportunities in one pipeline."
        noindex
      />
      <div className="min-h-screen bg-background text-foreground">
        {overdueCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/crm")}
            className="w-full bg-amber-500/10 border-b border-amber-500/40 text-amber-200 text-sm py-2 px-4 flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{overdueCount} follow-up{overdueCount === 1 ? "" : "s"} overdue</span>
            <Badge variant="outline" className="border-amber-500/40 text-amber-100">View in CRM →</Badge>
          </button>
        )}
        <WatchlistView
          fullScreen
          onClose={() => navigate("/")}
          onSearchSong={(q) => navigate("/", { state: { search: q } })}
          onViewCatalog={(name, role) => navigate("/", { state: { catalog: { name, role } } })}
        />
      </div>
    </ErrorBoundary>
  );
};

export default Watchlist;