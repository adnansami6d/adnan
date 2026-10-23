"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartItem } from "@/lib/cart";
import { taka } from "@/lib/format";

/** Live data from the database for one cart line (price, stock, still on sale?) */
export type LiveInfo = { price: number; stock: number; available: boolean };

type Props = {
  item: CartItem;
  live: LiveInfo;
  onQuantity: (variantId: number, quantity: number) => void;
  onRemove: (variantId: number) => void;
};

export default function CartItemRow({ item, live, onQuantity, onRemove }: Props) {
  const maxQty = Math.max(1, Math.min(20, live.stock));
  const tooMany = live.available && item.quantity > live.stock;
  const priceChanged = live.available && live.price !== item.price;

  return (
    <li className="flex gap-4 border-b border-neutral-200 py-4">
      <Link
        href={`/products/${item.slug}`}
        className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100"
      >
        {item.image && (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover"
            unoptimized={item.image.includes("placehold.co")}
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/products/${item.slug}`} className="line-clamp-2 font-medium hover:underline">
              {item.name}
            </Link>
            <p className="text-sm text-neutral-500">
              সাইজ: {item.size} · রং: {item.color}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.variantId)}
            className="shrink-0 text-sm text-neutral-500 underline hover:text-red-600"
          >
            মুছুন
          </button>
        </div>

        {!live.available ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700">
            এই আইটেম এখন পাওয়া যাচ্ছে না। অনুগ্রহ করে মুছে ফেলুন।
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-lg border border-neutral-300">
                <button
                  type="button"
                  className="px-3 py-1 disabled:opacity-40"
                  disabled={item.quantity <= 1}
                  onClick={() => onQuantity(item.variantId, item.quantity - 1)}
                  aria-label="কমান"
                >
                  −
                </button>
                <span className="min-w-8 text-center">{item.quantity}</span>
                <button
                  type="button"
                  className="px-3 py-1 disabled:opacity-40"
                  disabled={item.quantity >= maxQty}
                  onClick={() => onQuantity(item.variantId, item.quantity + 1)}
                  aria-label="বাড়ান"
                >
                  +
                </button>
              </div>
              <p className="font-semibold">{taka(live.price * item.quantity)}</p>
            </div>

            <p className="mt-1 text-sm text-neutral-500">
              প্রতিটি {taka(live.price)}
              {priceChanged && <span className="ml-2 text-amber-700">(দাম বদলেছে)</span>}
            </p>

            {tooMany && (
              <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm text-amber-800">
                স্টকে মাত্র {live.stock}টি আছে। পরিমাণ কমিয়ে নিন।
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
                }
