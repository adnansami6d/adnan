import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-xl">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-5 h-12 w-full rounded-2xl" />
      <SkeletonPanel lines={3} className="mt-6" />
    </LoadingFrame>
  );
}
