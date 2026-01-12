import { Skeleton } from "@/components/ui/skeleton";

export const CreditCardSkeleton = () => {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-4 animate-pulse">
      {/* Icon placeholder */}
      <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
      
      <div className="flex-1 min-w-0 space-y-2">
        {/* Name and badges */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* Publisher info */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      
      {/* Status badge */}
      <Skeleton className="h-6 w-20 rounded-full flex-shrink-0" />
    </div>
  );
};
