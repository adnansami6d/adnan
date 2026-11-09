import type { ReactNode } from "react";

/**
 * Grey placeholder blocks shown while a page loads (milestone M1).
 * Used by the loading.tsx files. Pure server-safe components (no hooks).
 */

/** One grey pulsing block. Give it a size with className, e.g. <Skeleton className="h-6 w-1/2" /> */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-neutral-200/80 ${className}`} />;
}

/** Wrapper for a whole loading screen: same width as the real page, and announces "loading" to screen readers. */
export function LoadingFrame({
  children,
  width = "max-w-6xl",
  label = "লোড হচ্ছে, একটু অপেক্ষা করুন...",
}: {
  children: ReactNode;
  /** a Tailwind max-width class that matches the real page, e.g. "max-w-2xl" */
  width?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`mx-auto px-4 py-8 ${width}`}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A card-shaped panel with a few text lines inside. */
export function SkeletonPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`card-sm p-5 ${className}`}>
      <Skeleton className="h-5 w-1/3" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** Product grid (same columns as the products page). */
export function SkeletonProductGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-sm overflow-hidden">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A list of rows (orders, cart items, ledger lines). */
export function SkeletonRows({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-sm flex items-center gap-4 p-4">
          <Skeleton className="h-16 w-16 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
