import { memo } from "react";

export const MissionLine = memo(() => {
  return (
    <p className="text-sm text-muted-foreground text-center max-w-lg mx-auto leading-relaxed">
      Quickly see who controls a song, assess dealability, and organize leads into projects and watchlists.
    </p>
  );
});

MissionLine.displayName = "MissionLine";