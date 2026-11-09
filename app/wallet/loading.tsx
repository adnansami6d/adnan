import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-2xl">
      <div className="space-y-6">
        <div className="card p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-12 w-48" />
          <Skeleton className="mt-3 h-4 w-32" />
        </div>
        <SkeletonPanel lines={3} />
        <SkeletonPanel lines={4} />
      </div>
    </LoadingFrame>
  );
}
