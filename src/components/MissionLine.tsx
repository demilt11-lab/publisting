import { memo } from "react";

export const MissionLine = memo(() => {
  return (
    <p className="text-sm text-muted-foreground text-center max-w-lg mx-auto leading-relaxed">
      Find out who wrote any song, who's signed, and discover unsigned talent worth pursuing.
    </p>
  );
});

MissionLine.displayName = "MissionLine";