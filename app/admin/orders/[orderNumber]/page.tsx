import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taka, formatDate } from "@/lib/format";
import { StatusBadge, StatusSteps } from "@/components/OrderStatus";

export const dynamic = "force-dynamic";

const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  pending: { to: "confirmed", label: "নিশ্চিত করুন" },
  confirmed: { to: "shipped", label: "পাঠানো হয়েছে" },
  shipped: { to: "delivered", label: "ডেলিভারি হয়েছে" },
};

const ERRORS: Record<string, string> = {
  FORBIDDEN: "অনুমতি নেই।",
  ORDER_NOT_FOUND: "অর্ডার পাওয়া যায়নি।",
  ORDER_FINALIZED: "এই অর্ডার আর বদলানো যাবে না।",
  INVALID_TRANSITION: "এই অবস্থায় যাওয়া যাবে না।",
  INVALID_STATUS: "অবস্থা সঠিক নয়।",
};

/** Runs on the server when an admin presses a status button. The database re-checks admin rights. */
async function changeStatus(formData: FormData) {
  "use server";
  const orderId = Number(formData.get("order_id"));
  const orderNumber = String(formData.get("order_number") ?? "");
  const status = String(formData.get("status") ?? "");
  const back = `/admin/orders/${encodeURIComponent(orderNumber)}`;

  if (!Number.isInteger(orderId) || orderId <= 0) redirect(`${back}?err=ORDER_NOT_FOUND`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_order_status", { p_order_id: orderId, p_status: status });

  revalidatePath(back);
  revalidatePath("/admin/orders");
  if (error) {
    const code = Object.keys(ERRORS).find((c) => error.message.includes(c)) ?? "UNKNOWN";
    redirect(`${back}?err=${code}`);
  }
  redirect(back);
}

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ err?: string }>;
};

export default async function AdminOrderDetail({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const { err } = await searchParams;
  const number = decodeURIComponent(orderNumber).replace(/[^0-9A-Za-z\-]/g, "");

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("order_number", number).maybeSingle();
  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name, size, color, unit_price, quantity, line_total")
    .eq("order_id", order.id)
    .order("id");

  const next = NEXT_STATUS[order.status];
  const finished = order.status === "cancelled" || order.status === "delivered";
  const errorText = err ? (ERRORS[err] ?? "কিছু একটা সমস্যা হয়েছে।") : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/orders" className="text-sm underline">
          ← সব অর্ডার
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">অর্ডার {order.order_number}</h2>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-neutral-600">{formatDate(order.created_at)}</p>
      </div>

      {errorText && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorText}</p>}

      <section className="rounded-lg border border-neutral-200 p-4">
        <StatusSteps status={order.status} />
      </section>

      {!finished && (
        <section className="flex flex-wrap items-start gap-3">
          {next && (
            <form action={changeStatus}>
              <input type="hidden" name="order_id" value={order.id} />
              <input type="hidden" name="order_number" value={order.order_number} />
              <input type="hidden" name="status" value={next.to} />
              <button className="rounded-lg bg-neutral-900 px-5 py-2.5 text-white hover:bg-neutral-700">
                {next.label}
              </button>
            </form>
          )}
          <details className="rounded-lg border border-red-200 p-2">
            <summary className="cursor-pointer text-sm text-red-700">অর্ডার বাতিল</summary>
            <form action={changeStatus} className="mt-2">
              <input type="hidden" name="order_id" value={order.id} />
              <input type="hidden" name="order_number" value={order.order_number} />
              <input type="hidden" name="status" value="cancelled" />
              <p className="mb-2 text-xs text-neutral-600">স্টক ও কয়েন ফেরত যাবে। নিশ্চিত?</p>
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
                হ্যাঁ, বাতিল করুন
              </button>
            </form>
          </details>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="mb-2 font-semibold">কাস্টমার</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-neutral-600">নাম</dt><dd>{order.customer_name}</dd></div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">ফোন</dt>
            <dd><a href={`tel:${order.phone}`} className="underline">{order.phone}</a></dd>
          </div>
          <div className="flex justify-between gap-4"><dt className="text-neutral-600">জেলা</dt><dd>{order.district}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-neutral-600">এলাকা</dt><dd>{order.area ?? "-"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-neutral-600">ঠিকানা</dt><dd className="text-right">{order.address}</dd></div>
          {order.note && (
            <div className="flex justify-between gap-4"><dt className="text-neutral-600">নোট</dt><dd className="text-right">{order.note}</dd></div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">অর্ডার ধরন</dt>
            <dd>{order.user_id ? "লগইন করা কাস্টমার" : "গেস্ট"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="mb-2 font-semibold">প্রোডাক্ট</h3>
        <ul className="divide-y divide-neutral-200 text-sm">
          {(items ?? []).map((it) => (
            <li key={it.id} className="flex justify-between gap-3 py-2">
              <div>
                <div className="font-medium">{it.product_name}</div>
                <div className="text-neutral-600">
                  {it.color} · {it.size} · {taka(it.unit_price)} × {it.quantity}
                </div>
              </div>
              <div className="font-medium">{taka(it.line_total)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="mb-2 font-semibold">হিসাব</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>সাবটোটাল</dt><dd>{taka(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>ডেলিভারি</dt><dd>{taka(order.delivery_fee)}</dd></div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <dt>ছাড়{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt>
              <dd>-{taka(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between font-semibold"><dt>মোট</dt><dd>{taka(order.total)}</dd></div>
          <div className="flex justify-between"><dt>কয়েনে পরিশোধ</dt><dd>{order.coin_used}</dd></div>
          <div className="flex justify-between font-semibold"><dt>ক্যাশ নিতে হবে</dt><dd>{taka(order.cod_due)}</dd></div>
        </dl>
      </section>
    </div>
  );
}
