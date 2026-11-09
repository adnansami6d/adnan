"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartItem } from "@/lib/cart";
import { taka } from "@/lib/format";
import Button from "@/components/Button";

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
    <li className="card-sm flex gap-3.5 p-3.5">
      <Link
        href={`/products/${item.slug}`}
        className="relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 shadow-[inset_0_2px_6px_rgba(15,23,42,0.09)]"
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

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/products/${item.slug}`} className="line-clamp-2 font-semibold leading-snug">
              {item.name}
            </Link>
            <p className="text-sm text-neutral-600">
              সাইজ: {item.size} · রং: {item.color}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 shrink-0 px-1 text-sm"
            onClick={() => onRemove(item.variantId)}
          >
            মুছুন
          </Button>
        </div>

        {!live.available ? (
          <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
            এই আইটেম এখন পাওয়া যাচ্ছে না। অনুগ্রহ করে মুছে ফেলুন।
          </p>
        ) : (
          <>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 rounded-[18px] bg-neutral-100 p-[3px] shadow-[inset_0_2px_6px_rgba(15,23,42,0.09)]">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-11 rounded-2xl p-0"
                  disabled={item.quantity <= 1}
                  onClick={() => onQuantity(item.variantId, item.quantity - 1)}
                  aria-label="কমান"
                >
                  −
                </Button>
                <span className="min-w-7 text-center font-semibold">{item.quantity}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-11 rounded-2xl p-0"
                  disabled={item.quantity >= maxQty}
                  onClick={() => onQuantity(item.variantId, item.quantity + 1)}
                  aria-label="বাড়ান"
                >
                  +
                </Button>
              </div>
              <div className="text-right">
                <p className="font-bold">{taka(live.price * item.quantity)}</p>
                <p className="text-[13px] text-neutral-600">
                  প্রতিটি {taka(live.price)}
                  {priceChanged && <span className="ml-1 text-amber-700">(দাম বদলেছে)</span>}
                </p>
              </div>
            </div>

            {tooMany && (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                স্টকে মাত্র {live.stock}টি আছে। পরিমাণ কমিয়ে নিন।
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
