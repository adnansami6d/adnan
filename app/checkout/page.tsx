"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { clearCart, loadCoupon, saveCoupon, toOrderItems, useCart } from "@/lib/cart";
import { coins, taka } from "@/lib/format";
import { BD_DISTRICTS, placeOrderSchema } from "@/lib/validators";
import Button, { buttonClasses } from "@/components/Button";
import Balance from "@/components/Balance";
import Coin from "@/components/Coin";
import { LoadingFrame, Skeleton, SkeletonPanel } from "@/components/Skeleton";

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

const inputClass = "input-pill";

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
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
  // blocks a second submit that arrives before React re-renders (e.g. pressing Enter twice quickly)
  const submitLock = useRef(false);
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
    if (submitting || submitLock.current) return;
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

    submitLock.current = true;
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
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  /* ---------------- success ---------------- */
  if (order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 md:py-12">
        <div className="card flex flex-col items-center gap-2 px-5 py-7 text-center">
          <div className="icon-box h-16 w-16 !rounded-[22px] text-green-700" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold text-green-800">অর্ডার সফল হয়েছে</h1>
          <p className="text-neutral-600">আপনার অর্ডার নম্বর</p>
          <p className="text-3xl font-bold tracking-wide">{order.order_number}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
            নম্বরটি সংরক্ষণ করুন। অর্ডার ট্র্যাক করতে এই নম্বর ও আপনার ফোন নম্বর লাগবে।
          </p>
        </div>

        <dl className="card-sm mt-5 space-y-2.5 p-5 text-[15px]">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-600">সাবটোটাল</dt>
            <dd>{taka(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
            <dd>{taka(order.delivery_fee)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between gap-3 text-green-700">
              <dt>ছাড়</dt>
              <dd>− {taka(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-neutral-900/10 pt-3 font-bold">
            <dt>মোট</dt>
            <dd>{taka(order.total)}</dd>
          </div>
          {order.coin_used > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-600">কয়েনে পরিশোধ</dt>
              <dd className="inline-flex items-center gap-1.5">
                − <Balance amount={order.coin_used} size="sm" />
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 text-[17px] font-bold">
            <dt>ডেলিভারির সময় দিতে হবে</dt>
            <dd>{taka(order.cod_due)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col gap-3">
          <Link href="/products" className={buttonClasses("primary", "lg", "w-full")}>
            আরও কেনাকাটা করুন
          </Link>
          {loggedIn ? (
            <Link href="/account/orders" className={buttonClasses("outline", "lg", "w-full")}>
              আমার অর্ডার
            </Link>
          ) : (
            <Link
              href={`/track?order=${encodeURIComponent(order.order_number)}`}
              className={buttonClasses("outline", "lg", "w-full")}
            >
              অর্ডার ট্র্যাক করুন
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- loading / empty ---------------- */
  if (!ready) {
    return (
      <LoadingFrame width="max-w-5xl">
        <Skeleton className="mb-6 h-8 w-36" />
        <div className="grid gap-6 md:grid-cols-[1fr_340px] md:gap-8">
          <SkeletonPanel lines={7} />
          <SkeletonPanel lines={6} />
        </div>
      </LoadingFrame>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold">আপনার কার্ট খালি</h1>
          <Link href="/products" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
            প্রোডাক্ট দেখুন
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------- form ---------------- */
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <h1 className="mb-5 text-2xl font-bold">চেকআউট</h1>

      <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_340px] md:gap-8" noValidate>
        <div className="card h-fit space-y-4 p-5">
          <h2 className="text-lg font-bold">ডেলিভারির তথ্য</h2>

          {!loggedIn && (
            <p className="card-sm p-3 text-sm leading-relaxed text-neutral-600">
              লগইন ছাড়াই অর্ডার করা যাবে (ক্যাশ অন ডেলিভারি)। কয়েন ব্যবহার করতে{" "}
              <Link href="/login?next=/checkout" className="font-semibold text-neutral-900 underline">
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

        <aside className="card h-fit space-y-4 p-5 md:sticky md:top-24">
          <h2 className="text-lg font-bold">অর্ডারের সারাংশ</h2>

          <ul className="space-y-1.5 text-sm">
            {items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {i.name} ({i.size}, {i.color}) × {i.quantity}
                </span>
                <span>{taka(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2.5 border-t border-neutral-900/10 pt-3 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">সাবটোটাল</dt>
              <dd>{taka(subtotal)}</dd>
            </div>
            {coupon && discount > 0 && (
              <div className="flex justify-between gap-3 text-green-700">
                <dt>কুপন ({coupon.code})</dt>
                <dd>− {taka(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
              <dd>{deliveryFee === null ? "জেলা বাছাই করুন" : taka(deliveryFee)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-neutral-900/10 pt-3 text-[17px] font-bold">
              <dt>মোট</dt>
              <dd>{taka(total)}</dd>
            </div>
          </dl>

          {/* coins: coin amounts always use the gold coin icon (<Balance>), money always uses ৳ */}
          {loggedIn ? (
            <div className="card-sm space-y-3.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Coin size={36} compact />
                  <div>
                    <div className="text-[13px] text-neutral-600">আপনার কয়েন</div>
                    <div className="text-xl font-bold">{coins(balance)}</div>
                  </div>
                </div>
                <span className="text-[13px] text-neutral-600">১ কয়েন = ১ টাকা</span>
              </div>

              {balance > 0 ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <input
                      value={coinInput}
                      onChange={(e) => setCoinInput(e.target.value.replace(/[^0-9]/g, ""))}
                      inputMode="numeric"
                      placeholder="কয়েন ব্যবহার"
                      aria-label="কয়েন ব্যবহার"
                      className="input-pill min-w-0 flex-1"
                    />
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setCoinInput(String(maxCoins))}>
                      সব
                    </Button>
                  </div>

                  <dl className="space-y-2.5 text-[15px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-600">মোট</dt>
                      <dd>{taka(total)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-green-700">
                      <dt>কয়েনে কাটবে</dt>
                      <dd className="inline-flex items-center gap-1.5">
                        − <Balance amount={coinUse} size="sm" />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-neutral-600">কয়েন বাকি থাকবে</dt>
                      <dd>
                        <Balance amount={balance - coinUse} size="sm" />
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <Link href="/wallet" className={buttonClasses("ghost", "sm", "min-h-11")}>
                  ওয়ালেটে কয়েন যোগ করুন
                </Link>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-[20px] bg-[linear-gradient(180deg,#2b2b2b,#0e0e0e)] px-4 py-3.5 text-white shadow-[0_12px_22px_-10px_rgba(0,0,0,0.55)]">
            <span className="text-[15px] font-semibold">ডেলিভারির সময় দিতে হবে</span>
            <span className="text-xl font-bold">{taka(codDue)}</span>
          </div>

          <p className="text-[13px] leading-relaxed text-neutral-600">
            পেমেন্ট: ক্যাশ অন ডেলিভারি{coinUse > 0 ? " (বাকি অংশ কয়েনে)" : ""}। চূড়ান্ত দাম অর্ডারের সময় সার্ভার হিসাব করে।
          </p>

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error.message}
              {error.code === "OUT_OF_STOCK" && (
                <Link href="/cart" className="ml-2 font-semibold underline">
                  কার্টে ফিরুন
                </Link>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              অর্ডার নিশ্চিত করুন
            </Button>
            <Link href="/cart" className={buttonClasses("ghost", "sm", "min-h-11 w-full")}>
              ← কার্টে ফিরুন
            </Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
