import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame width="max-w-4xl">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={3} />
        </div>
        <SkeletonPanel lines={5} />
      </div>
    </LoadingFrame>
  );
}
