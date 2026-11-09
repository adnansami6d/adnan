import { LoadingFrame, Skeleton, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-3xl">
      <Skeleton className="h-8 w-40" />
      <SkeletonRows rows={4} className="mt-6" />
    </LoadingFrame>
  );
}
