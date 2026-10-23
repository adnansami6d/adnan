export const STATUS_LABEL: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  confirmed: "নিশ্চিত হয়েছে",
  shipped: "পাঠানো হয়েছে",
  delivered: "ডেলিভারি হয়েছে",
  cancelled: "বাতিল",
};

const STEPS = ["pending", "confirmed", "shipped", "delivered"] as const;

const BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${BADGE[status] ?? "bg-neutral-100"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** 4-step progress line (pending → confirmed → shipped → delivered). Cancelled orders show a red note instead. */
export function StatusSteps({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="text-sm text-red-700">এই অর্ডারটি বাতিল করা হয়েছে।</p>;
  }
  const current = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done ? "bg-neutral-900" : "bg-neutral-200"}`} />
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  done ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <div
                className={`h-0.5 flex-1 ${
                  i === STEPS.length - 1 ? "bg-transparent" : i < current ? "bg-neutral-900" : "bg-neutral-200"
                }`}
              />
            </div>
            <span className={`mt-1 text-xs ${done ? "font-medium" : "text-neutral-500"}`}>{STATUS_LABEL[step]}</span>
          </li>
        );
      })}
    </ol>
  );
            }
                                             
