import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate, taka } from "@/lib/format";
import { StatusBadge, StatusSteps } from "@/components/OrderStatus";
import CancelOrderButton from "@/components/CancelOrderButton";
import { buttonClasses } from "@/components/Button";
import Balance from "@/components/Balance";

export const metadata: Metadata = { title: "আমার অর্ডার" };

type Item = {
  product_name: string;
  size: string;
  color: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
};

type Order = {
  id: number;
  order_number: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  coin_used: number;
  cod_due: number;
  created_at: string;
  order_items: Item[];
};

export default async function MyOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/orders");

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, subtotal, delivery_fee, discount, total, coin_used, cod_due, created_at, order_items(product_name, size, color, quantity, unit_price, image_url)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (data ?? []) as unknown as Order[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">আমার অর্ডার</h1>
        <Link href="/account" className={buttonClasses("ghost", "sm", "min-h-11")}>
          অ্যাকাউন্ট
        </Link>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">অর্ডার লোড করা যায়নি। ({error.message})</p>
      )}

      {!error && orders.length === 0 && (
        <div className="card p-10 text-center text-neutral-600">
          আপনি এখনো কোনো অর্ডার করেননি।
          <div className="mt-4">
            <Link href="/products" className={buttonClasses("primary", "lg")}>
              প্রোডাক্ট দেখুন
            </Link>
          </div>
        </div>
      )}

      <ul className="space-y-5">
        {orders.map((o) => (
          <li key={o.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{o.order_number}</p>
                <p className="text-sm text-neutral-600">{formatDate(o.created_at)}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="my-4">
              <StatusSteps status={o.status} />
            </div>

            <ul className="divide-y divide-neutral-900/10">
              {o.order_items.map((it, idx) => (
                <li key={idx} className="flex gap-3 py-2.5">
                  <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100 shadow-[inset_0_2px_6px_rgba(15,23,42,0.09)]">
                    {it.image_url && (
                      <Image
                        src={it.image_url}
                        alt={it.product_name}
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized={it.image_url.includes("placehold.co")}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="line-clamp-1 font-semibold">{it.product_name}</p>
                    <p className="text-neutral-600">
                      {it.size} · {it.color} · × {it.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{taka(it.unit_price * it.quantity)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-2 border-t border-neutral-900/10 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-600">সাবটোটাল</dt>
                <dd>{taka(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
                <dd>{taka(o.delivery_fee)}</dd>
              </div>
              {o.discount > 0 && (
                <div className="flex justify-between gap-3 text-green-700">
                  <dt>ছাড়</dt>
                  <dd>− {taka(o.discount)}</dd>
                </div>
              )}
              {o.coin_used > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-neutral-600">কয়েনে পরিশোধ</dt>
                  <dd className="inline-flex items-center gap-1.5">
                    − <Balance amount={o.coin_used} size="sm" />
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 text-base font-bold">
                <dt>মোট</dt>
                <dd>{taka(o.total)}</dd>
              </div>
              {o.status !== "cancelled" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-600">ডেলিভারির সময় দিতে হবে</dt>
                  <dd className="font-semibold">{taka(o.cod_due)}</dd>
                </div>
              )}
            </dl>

            {o.status === "pending" && (
              <div className="mt-4">
                <CancelOrderButton orderId={o.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
