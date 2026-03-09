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
        // Neutral badges: #111720 bg, #222A35 border, secondary text
        outline: "border-border bg-secondary text-secondary-foreground",
        // Publishing status badges
        signed: "border-[#14532D] bg-[#052E16] text-[#22C55E]",
        unsigned: "border-[#4A2F05] bg-[#3A2102] text-[#EAB308]",
        unknown: "border-border bg-secondary text-muted-foreground",
        // Entity badges — neutral
        publisher: "border-border bg-secondary text-secondary-foreground",
        label: "border-border bg-secondary text-secondary-foreground",
        management: "border-border bg-secondary text-secondary-foreground",
        // Unknown entity states
        "publisher-unknown": "border-border bg-secondary/50 text-muted-foreground",
        "label-unknown": "border-border bg-secondary/50 text-muted-foreground",
        "management-unknown": "border-border bg-secondary/50 text-muted-foreground",
        // Dealability badges — exact spec colors
        "deal-high": "border-transparent bg-[#052E16] text-[#16A34A]",
        "deal-medium": "border-transparent bg-[#451A03] text-[#D97706]",
        "deal-low": "border-transparent bg-[#450A0A] text-[#DC2626]",
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
