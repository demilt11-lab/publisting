import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-border/50 text-muted-foreground",
        // Publishing status badges - desaturated
        signed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        unsigned: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        unknown: "border-border bg-muted/50 text-muted-foreground",
        // Entity badges - subtle
        publisher: "border-emerald-500/20 bg-emerald-500/8 text-emerald-400",
        label: "border-blue-500/20 bg-blue-500/8 text-blue-400",
        management: "border-purple-500/20 bg-purple-500/8 text-purple-400",
        // Unknown entity states
        "publisher-unknown": "border-emerald-500/10 bg-emerald-500/5 text-emerald-400/60",
        "label-unknown": "border-blue-500/10 bg-blue-500/5 text-blue-400/60",
        "management-unknown": "border-purple-500/10 bg-purple-500/5 text-purple-400/60",
        // Dealability badges - desaturated, professional
        "deal-high": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        "deal-medium": "border-amber-500/20 bg-amber-500/10 text-amber-400",
        "deal-low": "border-red-500/20 bg-red-500/10 text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };