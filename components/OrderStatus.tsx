export const STATUS_LABEL: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  confirmed: "নিশ্চিত হয়েছে",
  shipped: "পাঠানো হয়েছে",
  delivered: "ডেলিভারি হয়েছে",
  cancelled: "বাতিল",
};

const STEPS = ["pending", "confirmed", "shipped", "delivered"] as const;

// Theme colours (M4): only white / gray / black, plus amber (waiting), green (done) and red (cancelled).
const BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  confirmed: "bg-neutral-100 text-neutral-800 ring-1 ring-neutral-300",
  shipped: "bg-neutral-800 text-white ring-1 ring-neutral-900",
  delivered: "bg-green-50 text-green-800 ring-1 ring-green-200",
  cancelled: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${BADGE[status] ?? "bg-neutral-100 text-neutral-800 ring-1 ring-neutral-300"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** 4-step progress line (pending → confirmed → shipped → delivered). Cancelled orders show a red note instead. */
export function StatusSteps({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">এই অর্ডারটি বাতিল করা হয়েছে।</p>;
  }
  const current = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done ? "bg-neutral-900" : "bg-neutral-300"}`} />
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-neutral-900 text-white shadow-[0_4px_8px_-3px_rgba(0,0,0,0.5)]"
                    : "bg-neutral-100 text-neutral-600 shadow-[inset_0_2px_4px_rgba(15,23,42,0.12)]"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <div
                className={`h-0.5 flex-1 ${
                  i === STEPS.length - 1 ? "bg-transparent" : i < current ? "bg-neutral-900" : "bg-neutral-300"
                }`}
              />
            </div>
            <span className={`mt-1.5 text-xs ${done ? "font-semibold" : "text-neutral-600"}`}>{STATUS_LABEL[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
