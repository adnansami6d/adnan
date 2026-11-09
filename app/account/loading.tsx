import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-2xl">
      <Skeleton className="h-8 w-44" />
      <div className="mt-6 space-y-4">
        <SkeletonPanel lines={4} />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    </LoadingFrame>
  );
}
