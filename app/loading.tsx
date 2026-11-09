import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

/** Fallback loading screen for any page that has no loading.tsx of its own (milestone M1). */
export default function Loading() {
  return (
    <LoadingFrame width="max-w-3xl">
      <Skeleton className="h-8 w-1/2" />
      <div className="mt-6 space-y-4">
        <SkeletonPanel lines={3} />
        <SkeletonPanel lines={2} />
      </div>
    </LoadingFrame>
  );
}
