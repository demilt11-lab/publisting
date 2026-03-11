import { memo } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export const MethodologyPopover = memo(() => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <Info className="w-3 h-3" />
          How this is estimated
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Methodology</h4>
          <ul className="space-y-2 text-muted-foreground text-xs">
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>
                <strong className="text-foreground">Signing status</strong> is estimated from writer and publisher counts, 
                indie vs major ownership, and PRO registration data.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>
                <strong className="text-foreground">Catalog scores</strong> weigh credits, PRO data, 
                streams, airplay, and chart history where available.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>
                These are <strong className="text-foreground">scouting signals only</strong> and are not legal 
                confirmation of rights; always verify with actual rights holders.
              </span>
            </li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
});

MethodologyPopover.displayName = "MethodologyPopover";
