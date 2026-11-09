"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

/** Cart button with a bag icon and a count badge (a real button look: raised, white). */
export default function CartLink() {
  const { count } = useCart();

  return (
    <Link href="/cart" className="btn btn-secondary btn-sm" aria-label={count > 0 ? `কার্ট, ${count}টি আইটেম` : "কার্ট"}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 7h12l-1 13H7L6 7Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </svg>
      <span className="hidden sm:inline">কার্ট</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs font-semibold leading-5 text-white shadow">
          {count}
        </span>
      )}
    </Link>
  );
}
