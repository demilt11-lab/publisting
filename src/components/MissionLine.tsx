import { memo } from "react";

export const MissionLine = memo(() => {
  return (
    <p className="text-xs text-muted-foreground/70 text-center max-w-md mx-auto">
      PubCheck helps A&R, publishers, and managers quickly see who controls a song, 
      how dealable it is, and organize leads into projects and watchlists.
    </p>
  );
});

MissionLine.displayName = "MissionLine";
