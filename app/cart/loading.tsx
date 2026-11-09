import { LoadingFrame, Skeleton, SkeletonPanel, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-5xl">
      <Skeleton className="h-8 w-32" />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_20rem]">
        <SkeletonRows rows={3} />
        <SkeletonPanel lines={4} />
      </div>
    </LoadingFrame>
  );
}
