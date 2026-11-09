import { LoadingFrame, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame>
      <div className="grid gap-8 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-11 w-14 rounded-2xl" />
            <Skeleton className="h-11 w-14 rounded-2xl" />
            <Skeleton className="h-11 w-14 rounded-2xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </LoadingFrame>
  );
}
