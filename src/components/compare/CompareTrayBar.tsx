import { Link } from "react-router-dom";
import { GitCompare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompareTray } from "@/hooks/useCompareTray";

/** Floating tray that surfaces queued compare items across the app. */
export function CompareTrayBar() {
  const { items, remove, clear } = useCompareTray();
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-3 py-1.5 shadow-lg">
        <GitCompare className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Compare</span>
        <Badge variant="secondary" className="text-[9px] h-4">{items.length}</Badge>
        <div className="flex items-center gap-1 max-w-[40vw] overflow-x-auto">
          {items.map((i) => (
            <span key={i.pub_id} className="flex items-center gap-1 border border-border/60 rounded-full px-2 py-0.5 text-[10px] shrink-0">
              <span className="capitalize text-muted-foreground">{i.kind}</span>
              <span className="truncate max-w-[120px]">{i.name}</span>
              <button onClick={() => remove(i.pub_id)} aria-label="Remove" className="text-muted-foreground hover:text-foreground">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <Link to="/compare"><Button size="sm" className="h-7 text-xs">Open</Button></Link>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>Clear</Button>
      </div>
    </div>
  );
}