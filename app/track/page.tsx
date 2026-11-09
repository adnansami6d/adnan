"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate, taka } from "@/lib/format";
import { normalizeBdPhone } from "@/lib/validators";
import { StatusBadge, StatusSteps } from "@/components/OrderStatus";
import Button, { buttonClasses } from "@/components/Button";
import Balance from "@/components/Balance";

type TrackItem = {
  name: string;
  size: string;
  color: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
};

type Tracked = {
  order_number: string;
  status: string;
  created_at: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  coin_used: number;
  cod_due: number;
  total: number;
  items: TrackItem[];
};

const inputClass = "input-pill";

/** Guest order tracking: the order number AND the phone number used for the order must both match. */
export default function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Tracked | null>(null);

  // allow links like /track?order=BD261023-1001
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("order");
    if (q) setOrderNumber(q);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResult(null);

    const number = orderNumber.trim().toUpperCase();
    if (!number) {
      setError("অর্ডার নম্বর লিখুন।");
      return;
    }
    if (!normalizeBdPhone(phone)) {
      setError("অর্ডারের সময় দেওয়া সঠিক মোবাইল নম্বর লিখুন।");
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await createClient().rpc("track_order", {
        p_order_number: number,
        p_phone: phone,
      });
      if (rpcError) {
        setError("এখন খুঁজে পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।");
      } else if (!data) {
        setError("এই নম্বর ও মোবাইল নম্বর দিয়ে কোনো অর্ডার পাওয়া যায়নি। নম্বরগুলো আবার দেখুন।");
      } else {
        setResult(data as Tracked);
      }
    } catch {
      setError("ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:py-8">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">অর্ডার ট্র্যাক করুন</h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">
          অর্ডার নম্বর ও অর্ডারের সময় দেওয়া মোবাইল নম্বর লিখুন।
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">অর্ডার নম্বর</span>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="BD261023-1001"
              className={`${inputClass} uppercase`}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">মোবাইল নম্বর</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              className={inputClass}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            খুঁজুন
          </Button>
        </form>
      </div>

      {result && (
        <div className="card mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold">{result.order_number}</p>
              <p className="text-sm text-neutral-600">{formatDate(result.created_at)}</p>
            </div>
            <StatusBadge status={result.status} />
          </div>

          <div className="my-4">
            <StatusSteps status={result.status} />
          </div>

          <ul className="divide-y divide-neutral-900/10 text-sm">
            {result.items.map((it, idx) => (
              <li key={idx} className="flex justify-between gap-3 py-2.5">
                <span className="min-w-0 flex-1 font-semibold">
                  {it.name}
                  <span className="block font-normal text-neutral-600">
                    {it.size} · {it.color} · × {it.quantity}
                  </span>
                </span>
                <span className="font-medium">{taka(it.unit_price * it.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-2 border-t border-neutral-900/10 pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">সাবটোটাল</dt>
              <dd>{taka(result.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
              <dd>{taka(result.delivery_fee)}</dd>
            </div>
            {result.discount > 0 && (
              <div className="flex justify-between gap-3 text-green-700">
                <dt>ছাড়</dt>
                <dd>− {taka(result.discount)}</dd>
              </div>
            )}
            {result.coin_used > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-600">কয়েনে পরিশোধ</dt>
                <dd className="inline-flex items-center gap-1.5">
                  − <Balance amount={result.coin_used} size="sm" />
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3 text-base font-bold">
              <dt>মোট</dt>
              <dd>{taka(result.total)}</dd>
            </div>
            {result.status !== "cancelled" && (
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-600">ডেলিভারির সময় দিতে হবে</dt>
                <dd className="font-semibold">{taka(result.cod_due)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/products" className={buttonClasses("ghost", "sm", "min-h-11")}>
          ← কেনাকাটায় ফিরুন
        </Link>
      </div>
    </div>
  );
}
