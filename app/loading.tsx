/** Shown automatically while any page is loading, so visitors always see that something is happening. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex max-w-md flex-col items-center px-4 py-24">
      <div className="fixed left-0 top-0 h-1 w-full overflow-hidden bg-neutral-100">
        <div className="h-full w-1/2 animate-pulse bg-neutral-900" />
      </div>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
      <p className="mt-4 text-sm text-neutral-600">লোড হচ্ছে, একটু অপেক্ষা করুন...</p>
    </div>
  );
}
