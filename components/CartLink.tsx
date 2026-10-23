"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function CartLink() {
  const { count } = useCart();

  return (
    <Link href="/cart" className="relative rounded-lg px-3 py-2 hover:bg-neutral-100">
      কার্ট
      {count > 0 && (
        <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
