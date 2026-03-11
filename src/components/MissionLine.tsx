import { memo } from "react";

export const MissionLine = memo(() => {
  return (
    <p className="text-sm text-muted-foreground text-center max-w-lg mx-auto leading-relaxed">
      Find who wrote it, who is signed, and what they've done.
    </p>
  );
});

MissionLine.displayName = "MissionLine";