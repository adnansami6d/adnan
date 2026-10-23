"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadCoupon, removeFromCart, saveCoupon, updateQuantity, useCart } from "@/lib/cart";
import { taka } from "@/lib/format";
import CartItemRow, { type LiveInfo } from "@/components/CartItem";
import Button, { buttonClasses } from "@/components/Button";

type Validation = { valid: boolean; discount?: number; code?: string; message?: string };

async function validateCoupon(code: string, subtotal: number): Promise<Validation> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("validate_coupon", { p_code: code, p_subtotal: subtotal });
    if (error || !data) return { valid: false };
    return data as Validation;
  } catch {
    return { valid: false };
  }
}

function couponError(message?: string): string {
  if (!message) return "কুপন প্রয়োগ করা যায়নি।";
  if (message.startsWith("COUPON_MIN_ORDER")) {
    return `এই কুপনের জন্য কমপক্ষে ${taka(Number(message.split(":")[1] ?? 0))} কেনাকাটা করতে হবে।`;
  }
  switch (message) {
    case "COUPON_EXPIRED":
      return "কুপনের মেয়াদ শেষ।";
    case "COUPON_NOT_STARTED":
      return "কুপন এখনো চালু হয়নি।";
    case "COUPON_LIMIT_REACHED":
      return "এই কুপনের ব্যবহারের সীমা শেষ।";
    default:
      return "কুপন সঠিক নয়।";
  }
}

type VariantRow = {
  id: number;
  price: number | null;
  stock: number;
  is_active: boolean;
  products: { base_price: number; is_active: boolean } | { base_price: number; is_active: boolean }[] | null;
};

export default function CartPage() {
  const { items } = useCart();
  const [ready, setReady] = useState(false);

  // live prices / stock from the database
  const [live, setLive] = useState<Record<number, LiveInfo>>({});
  const [liveOk, setLiveOk] = useState(false);

  // coupon
  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  // delivery fees (shown for information; the exact fee is decided at checkout)
  const [fees, setFees] = useState({ dhaka: 100, outside: 150 });

  useEffect(() => {
    const saved = loadCoupon();
    if (saved) {
      setCouponInput(saved);
      setApplied({ code: saved, discount: 0 });
    }
    setReady(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient()
          .from("shop_settings")
          .select("key, value")
          .in("key", ["delivery_dhaka", "delivery_outside"]);
        if (!data) return;
        const get = (k: string, fallback: number) => data.find((r) => r.key === k)?.value ?? fallback;
        setFees({ dhaka: get("delivery_dhaka", 100), outside: get("delivery_outside", 150) });
      } catch {
        // keep defaults
      }
    })();
  }, []);

  const idsKey = items
    .map((i) => i.variantId)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!idsKey) {
      setLive({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = idsKey.split(",").map(Number);
        const { data, error } = await createClient()
          .from("product_variants")
          .select("id, price, stock, is_active, products(base_price, is_active)")
          .in("id", ids);
        if (cancelled) return;
        if (error || !data) {
          setLiveOk(false);
          return;
        }
        const map: Record<number, LiveInfo> = {};
        for (const v of data as unknown as VariantRow[]) {
          const p = Array.isArray(v.products) ? v.products[0] : v.products;
          map[v.id] = {
            price: v.price ?? p?.base_price ?? 0,
            stock: v.stock,
            available: v.is_active && !!p?.is_active && v.stock > 0,
          };
        }
        setLive(map);
        setLiveOk(true);
      } catch {
        if (!cancelled) setLiveOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const rows = useMemo(
    () =>
      items.map((item) => {
        // if the live check failed we trust the stored data; items missing from a successful check are gone
        const info: LiveInfo = liveOk
          ? (live[item.variantId] ?? { price: item.price, stock: 0, available: false })
          : { price: item.price, stock: 99, available: true };
        return { item, info };
      }),
    [items, live, liveOk]
  );

  const subtotal = rows.reduce((sum, r) => (r.info.available ? sum + r.info.price * r.item.quantity : sum), 0);
  const hasProblem = rows.some((r) => !r.info.available || r.item.quantity > r.info.stock);
  const discount = applied ? Math.min(applied.discount, subtotal) : 0;

  // keep the coupon discount correct whenever the subtotal changes
  useEffect(() => {
    if (!applied) return;
    if (subtotal <= 0) {
      setApplied(null);
      saveCoupon(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await validateCoupon(applied.code, subtotal);
      if (cancelled) return;
      if (res.valid) {
        setApplied((a) => (a ? { ...a, discount: res.discount ?? 0 } : a));
      } else {
        setApplied(null);
        saveCoupon(null);
        setCouponMsg({ type: "error", text: couponError(res.message) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, applied?.code]);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCouponMsg(null);
    const res = await validateCoupon(code, subtotal);
    setChecking(false);
    if (res.valid) {
      setApplied({ code: res.code ?? code, discount: res.discount ?? 0 });
      saveCoupon(res.code ?? code);
      setCouponMsg({ type: "ok", text: "কুপন প্রয়োগ হয়েছে।" });
    } else {
      setCouponMsg({ type: "error", text: couponError(res.message) });
    }
  }

  function removeCoupon() {
    setApplied(null);
    saveCoupon(null);
    setCouponInput("");
    setCouponMsg(null);
  }

  if (!ready) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-neutral-500">লোড হচ্ছে...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">আপনার কার্ট খালি</h1>
        <p className="mt-2 text-neutral-500">পছন্দের প্রোডাক্ট কার্টে যোগ করুন।</p>
        <Link href="/products" className={`${buttonClasses("primary", "lg")} mt-6`}>
          প্রোডাক্ট দেখুন
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">আপনার কার্ট</h1>

      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <ul>
          {rows.map(({ item, info }) => (
            <CartItemRow
              key={item.variantId}
              item={item}
              live={info}
              onQuantity={updateQuantity}
              onRemove={removeFromCart}
            />
          ))}
        </ul>

        <aside className="h-fit rounded-lg border border-neutral-200 p-4 md:sticky md:top-24">
          <h2 className="mb-3 text-lg font-semibold">অর্ডারের সারাংশ</h2>

          {/* coupon */}
          <div className="mb-4">
            {applied ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <span>
                  কুপন <strong>{applied.code}</strong>
                </span>
                <button type="button" onClick={removeCoupon} className="underline">
                  সরান
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="কুপন কোড"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm uppercase outline-none focus:border-neutral-900"
                />
                <Button size="sm" variant="outline" onClick={applyCoupon} loading={checking} disabled={subtotal <= 0}>
                  প্রয়োগ
                </Button>
              </div>
            )}
            {couponMsg && (
              <p className={`mt-2 text-sm ${couponMsg.type === "ok" ? "text-green-700" : "text-red-600"}`}>
                {couponMsg.text}
              </p>
            )}
          </div>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">সাবটোটাল</dt>
              <dd>{taka(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-700">
                <dt>ছাড়</dt>
                <dd>− {taka(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
              <dt>ডেলিভারি ছাড়া মোট</dt>
              <dd>{taka(subtotal - discount)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-neutral-500">
            ডেলিভারি চার্জ চেকআউটে ঠিকানা অনুযায়ী যোগ হবে: ঢাকায় {taka(fees.dhaka)}, ঢাকার বাইরে {taka(fees.outside)}।
          </p>

          {hasProblem && (
            <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-sm text-amber-800">
              চেকআউটের আগে অপ্রাপ্য বা স্টকের চেয়ে বেশি পরিমাণের আইটেম ঠিক করুন।
            </p>
          )}

          <div className="mt-4">
            {hasProblem || subtotal <= 0 ? (
              <Button size="lg" disabled className="w-full">
                চেকআউটে যান
              </Button>
            ) : (
              <Link href="/checkout" className={buttonClasses("primary", "lg", "w-full")}>
                চেকআউটে যান
              </Link>
            )}
            <Link href="/products" className={buttonClasses("ghost", "sm", "mt-2 w-full")}>
              আরও কেনাকাটা করুন
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
