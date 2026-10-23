import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate, taka } from "@/lib/format";
import { StatusBadge, StatusSteps } from "@/components/OrderStatus";
import CancelOrderButton from "@/components/CancelOrderButton";
import { buttonClasses } from "@/components/Button";

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">আমার অর্ডার</h1>
        <Link href="/account" className="text-sm underline">
          অ্যাকাউন্ট
        </Link>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">অর্ডার লোড করা যায়নি। ({error.message})</p>
      )}

      {!error && orders.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
          আপনি এখনো কোনো অর্ডার করেননি।
          <div className="mt-4">
            <Link href="/products" className={buttonClasses("primary", "md")}>
              প্রোডাক্ট দেখুন
            </Link>
          </div>
        </div>
      )}

      <ul className="space-y-6">
        {orders.map((o) => (
          <li key={o.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{o.order_number}</p>
                <p className="text-sm text-neutral-500">{formatDate(o.created_at)}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="my-4">
              <StatusSteps status={o.status} />
            </div>

            <ul className="divide-y divide-neutral-100">
              {o.order_items.map((it, idx) => (
                <li key={idx} className="flex gap-3 py-2">
                  <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded bg-neutral-100">
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
                    <p className="line-clamp-1 font-medium">{it.product_name}</p>
                    <p className="text-neutral-500">
                      {it.size} · {it.color} · × {it.quantity}
                    </p>
                  </div>
                  <p className="text-sm">{taka(it.unit_price * it.quantity)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-600">সাবটোটাল</dt>
                <dd>{taka(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600">ডেলিভারি চার্জ</dt>
                <dd>{taka(o.delivery_fee)}</dd>
              </div>
              {o.discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>ছাড়</dt>
                  <dd>− {taka(o.discount)}</dd>
                </div>
              )}
              {o.coin_used > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">কয়েনে পরিশোধ</dt>
                  <dd>− {taka(o.coin_used)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>মোট</dt>
                <dd>{taka(o.total)}</dd>
              </div>
              {o.status !== "cancelled" && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">ডেলিভারির সময় দিতে হবে</dt>
                  <dd>{taka(o.cod_due)}</dd>
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
          
