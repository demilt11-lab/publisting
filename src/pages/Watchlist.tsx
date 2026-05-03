import { useNavigate } from "react-router-dom";
import { WatchlistView } from "@/components/WatchlistView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Watchlist = () => {
  const navigate = useNavigate();
  return (
    <ErrorBoundary fallbackTitle="Watchlist failed to load">
      <div className="min-h-screen bg-background text-foreground">
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