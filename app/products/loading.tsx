import { LoadingFrame, Skeleton, SkeletonProductGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingFrame>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-5 h-14 w-full rounded-2xl" />
      <div className="mt-6">
        <SkeletonProductGrid count={8} />
      </div>
    </LoadingFrame>
  );
}
