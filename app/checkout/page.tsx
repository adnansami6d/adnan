"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { clearCart, loadCoupon, saveCoupon, toOrderItems, useCart } from "@/lib/cart";
import { taka } from "@/lib/format";
import { BD_DISTRICTS, placeOrderSchema } from "@/lib/validators";
import Button, { buttonClasses } from "@/components/Button";

type OrderResult = {
  order_id: number;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  coin_used: number;
  cod_due: number;
};

type Validation = { valid: boolean; discount?: number; code?: string; message?: string };

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

export default function CheckoutPage() {
  const { items, subtotal } = useCart();
  const [ready, setReady] = useState(false);

  // form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");

  // account / wallet
  const [loggedIn, setLoggedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [coinInput, setCoinInput] = useState("");

  // pricing helpers
  const [fees, setFees] = useState({ dhaka: 100, outside: 150 });
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);

  // submit state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);

  // load account data (prefill), delivery fees and the coupon chosen in the cart
  useEffect(() => {
    (async () => {
      const supabase = createClient();

      try {
        const { data } = await supabase
          .from("shop_settings")
          .select("key, value")
          .in("key", ["delivery_dhaka", "delivery_outside"]);
        if (data) {
          const get = (k: string, fallback: number) => data.find((r) => r.key === k)?.value ?? fallback;
          setFees({ dhaka: get("delivery_dhaka", 100), outside: get("delivery_outside", 150) });
        }
      } catch {
        // keep defaults
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setLoggedIn(true);
          const [profile, wallet, addr] = await Promise.all([
            supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
            supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
            supabase
              .from("addresses")
              .select("full_name, phone, address, area, district")
              .eq("user_id", user.id)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          setBalance(wallet.data?.balance ?? 0);

          const a = addr.data;
          const p = profile.data;
          setName((v) => v || a?.full_name || p?.full_name || "");
          setPhone((v) => v || a?.phone || p?.phone || "");
          setAddress((v) => v || a?.address || "");
          setArea((v) => v || a?.area || "");
          setDistrict((v) => v || (a?.district && (BD_DISTRICTS as readonly string[]).includes(a.district) ? a.district : ""));
        }
      } catch {
        // guest checkout still works
      }

      const saved = loadCoupon();
      if (saved) setCoupon({ code: saved, discount: 0 });
      setReady(true);
    })();
  }, []);

  // re-check the coupon against the current subtotal (display only; the server checks again)
  useEffect(() => {
    if (!coupon || subtotal <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcError } = await createClient().rpc("validate_coupon", {
          p_code: coupon.code,
          p_subtotal: subtotal,
        });
        if (cancelled) return;
        const res = data as Validation | null;
        if (rpcError || !res?.valid) {
          setCoupon(null);
          saveCoupon(null);
        } else {
          setCoupon((c) => (c ? { ...c, discount: res.discount ?? 0 } : c));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, coupon?.code]);

  const deliveryFee = district === "" ? null : district === "Dhaka" ? fees.dhaka : fees.outside;
  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const total = subtotal - discount + (deliveryFee ?? 0);

  const maxCoins = Math.max(0, Math.min(balance, total));
  const coinUse = useMemo(() => {
    const n = parseInt(coinInput || "0", 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, maxCoins);
  }, [coinInput, maxCoins]);
  const codDue = total - coinUse;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const payload = {
      name,
      phone,
      address,
      district,
      area,
      note,
      items: toOrderItems(items),
      coupon_code: coupon?.code ?? "",
      coin_use: coinUse,
    };

    const check = placeOrderSchema.safeParse(payload);
    if (!check.success) {
      const errs: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        clearCart();
        setOrder(json.order as OrderResult);
        window.scrollTo({ top: 0 });
      } else {
        setError({
          code: json?.error ?? "SERVER_ERROR",
          message: json?.message ?? "অর্ডার করা যায়নি। আবার চেষ্টা করুন।",
        });
      }
    } catch {
      setError({ code: "NETWORK", message: "ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- success ---------------- */
  if (order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <h1 className="text-2xl font-bold text-green-800">অর্ডার সফল হয়েছে</h1>
          <p className="mt-2 text-neutral-700">আপনার অর্ডার নম্বর</p>
          <p className="mt-1 text-3xl font-bold tracking-wide">{order.order_number}</p>
          <p className="mt-3 text-sm text-neutral-600">
            নম্বরটি সংরক্ষণ করুন। অর্ডার ট্র্যাক করতে এই নম্বর ও আপনার ফোন নম্বর লাগবে।
          </p>
        </div>

        <dl className="mt-6 space-y-2 rounded-lg border border-neutral-200 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-600">সাবটোটাল</dt>
            <dd>{taka(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
            <dd>{taka(order.delivery_fee)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-green-700">
              <dt>ছাড়</dt>
              <dd>− {taka(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
            <dt>মোট</dt>
            <dd>{taka(order.total)}</dd>
          </div>
          {order.coin_used > 0 && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">কয়েনে পরিশোধ</dt>
              <dd>− {taka(order.coin_used)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>ডেলিভারির সময় দিতে হবে</dt>
            <dd>{taka(order.cod_due)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/products" className={buttonClasses("primary")}>
            আরও কেনাকাটা করুন
          </Link>
          {loggedIn ? (
            <Link href="/account/orders" className={buttonClasses("outline")}>
              আমার অর্ডার
            </Link>
          ) : (
            <Link href={`/track?order=${encodeURIComponent(order.order_number)}`} className={buttonClasses("outline")}>
              অর্ডার ট্র্যাক করুন
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- loading / empty ---------------- */
  if (!ready) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-neutral-500">লোড হচ্ছে...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">আপনার কার্ট খালি</h1>
        <Link href="/products" className={`${buttonClasses("primary", "lg")} mt-6`}>
          প্রোডাক্ট দেখুন
        </Link>
      </div>
    );
  }

  /* ---------------- form ---------------- */
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">চেকআউট</h1>

      <form onSubmit={submit} className="grid gap-8 md:grid-cols-[1fr_340px]" noValidate>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">ডেলিভারির তথ্য</h2>

          {!loggedIn && (
            <p className="rounded-lg bg-neutral-100 p-3 text-sm text-neutral-600">
              লগইন ছাড়াই অর্ডার করা যাবে (ক্যাশ অন ডেলিভারি)। কয়েন ব্যবহার করতে{" "}
              <Link href="/login?next=/checkout" className="font-medium underline">
                লগইন করুন
              </Link>
              ।
            </p>
          )}

          <Field label="আপনার নাম" error={fieldErrors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} />
          </Field>

          <Field label="মোবাইল নম্বর" error={fieldErrors.phone}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              className={inputClass}
            />
          </Field>

          <Field label="জেলা" error={fieldErrors.district}>
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass}>
              <option value="">জেলা বাছাই করুন</option>
              {BD_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          <Field label="এলাকা / থানা (ঐচ্ছিক)" error={fieldErrors.area}>
            <input value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} />
          </Field>

          <Field label="পুরো ঠিকানা (বাসা, রোড, এলাকা)" error={fieldErrors.address}>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              autoComplete="street-address"
              className={inputClass}
            />
          </Field>

          <Field label="নোট (ঐচ্ছিক)" error={fieldErrors.note}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ডেলিভারি নিয়ে কিছু বলার থাকলে"
              className={inputClass}
            />
          </Field>

          {fieldErrors.items && <p className="text-sm text-red-600">{fieldErrors.items}</p>}
        </div>

        <aside className="h-fit space-y-4 rounded-lg border border-neutral-200 p-4 md:sticky md:top-24">
          <h2 className="text-lg font-semibold">অর্ডারের সারাংশ</h2>

          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {i.name} ({i.size}, {i.color}) × {i.quantity}
                </span>
                <span>{taka(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-neutral-200 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">সাবটোটাল</dt>
              <dd>{taka(subtotal)}</dd>
            </div>
            {coupon && discount > 0 && (
              <div className="flex justify-between text-green-700">
                <dt>কুপন ({coupon.code})</dt>
                <dd>− {taka(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
              <dd>{deliveryFee === null ? "জেলা বাছাই করুন" : taka(deliveryFee)}</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
              <dt>মোট</dt>
              <dd>{taka(total)}</dd>
            </div>
          </dl>

          {/* coins */}
          {loggedIn ? (
            <div className="rounded-lg bg-neutral-50 p-3 text-sm">
              <p>
                আপনার কয়েন: <strong>{balance}</strong> (১ কয়েন = ১ টাকা)
              </p>
              {balance > 0 ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={coinInput}
                    onChange={(e) => setCoinInput(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="কয়েন ব্যবহার"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => setCoinInput(String(maxCoins))}>
                    সব
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-neutral-500">
                  <Link href="/wallet" className="underline">
                    ওয়ালেটে কয়েন যোগ করুন
                  </Link>
                </p>
              )}
              {coinUse > 0 && <p className="mt-2 text-green-700">কয়েনে কাটবে: {taka(coinUse)}</p>}
            </div>
          ) : null}

          <div className="flex justify-between rounded-lg bg-neutral-900 px-3 py-2 font-bold text-white">
            <span>ডেলিভারির সময় দিতে হবে</span>
            <span>{taka(codDue)}</span>
          </div>

          <p className="text-xs text-neutral-500">
            পেমেন্ট: ক্যাশ অন ডেলিভারি{coinUse > 0 ? " (বাকি অংশ কয়েনে)" : ""}। চূড়ান্ত দাম অর্ডারের সময় সার্ভার হিসাব করে।
          </p>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error.message}
              {error.code === "OUT_OF_STOCK" && (
                <Link href="/cart" className="ml-2 font-medium underline">
                  কার্টে ফিরুন
                </Link>
              )}
            </div>
          )}

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            অর্ডার নিশ্চিত করুন
          </Button>
          <Link href="/cart" className={buttonClasses("ghost", "sm", "w-full")}>
            ← কার্টে ফিরুন
          </Link>
        </aside>
      </form>
    </div>
  );
}
