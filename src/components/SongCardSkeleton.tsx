import { Skeleton } from "@/components/ui/skeleton";

export const SongCardSkeleton = () => (
  <div className="glass rounded-2xl p-4 sm:p-6 flex flex-col gap-4 animate-fade-up">
    <div className="flex gap-4 sm:gap-6 items-start">
      <Skeleton className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-1.5 mt-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg mt-2" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);
