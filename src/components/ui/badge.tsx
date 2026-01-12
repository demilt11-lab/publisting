import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        signed: "border-transparent bg-success/20 text-success",
        unsigned: "border-transparent bg-warning/20 text-warning",
        unknown: "border-transparent bg-muted text-muted-foreground",
        // Signing status badges
        publisher: "border-emerald-500/30 bg-emerald-500/20 text-emerald-400",
        label: "border-blue-500/30 bg-blue-500/20 text-blue-400",
        management: "border-purple-500/30 bg-purple-500/20 text-purple-400",
        // Unconfirmed versions
        "publisher-unknown": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400/50",
        "label-unknown": "border-blue-500/20 bg-blue-500/10 text-blue-400/50",
        "management-unknown": "border-purple-500/20 bg-purple-500/10 text-purple-400/50",
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

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
