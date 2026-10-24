import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { taka, formatDate } from "@/lib/format";
import { StatusBadge, STATUS_LABEL } from "@/components/OrderStatus";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
const PAGE_SIZE = 30;

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : "";
  const q = (sp.q ?? "").trim().replace(/[^0-9A-Za-z\-]/g, "").slice(0, 30);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("order_number, customer_name, phone, district, total, cod_due, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`order_number.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, count, error } = await query;
  const orders = data ?? [];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (p: { status?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const s = p.status ?? status;
    const qq = p.q ?? q;
    if (s) params.set("status", s);
    if (qq) params.set("q", qq);
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const str = params.toString();
    return `/admin/orders${str ? `?${str}` : ""}`;
  };

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">অর্ডার ({total})</h2>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        <Link
          href={link({ status: "", page: 1 })}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${!status ? "bg-neutral-900 text-white" : "border-neutral-300"}`}
        >
          সব
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={link({ status: s, page: 1 })}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${status === s ? "bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      <form action="/admin/orders" className="mb-4 flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="অর্ডার নম্বর বা ফোন"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">খুঁজুন</button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">অর্ডার আনা যায়নি। আবার চেষ্টা করুন।</p>}

      {!error && orders.length === 0 ? (
        <p className="text-sm text-neutral-600">কোনো অর্ডার পাওয়া যায়নি।</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {orders.map((o) => (
            <li key={o.order_number}>
              <Link href={`/admin/orders/${o.order_number}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-neutral-50">
                <div>
                  <div className="font-medium">{o.order_number}</div>
                  <div className="text-neutral-600">
                    {o.customer_name} · {o.phone} · {o.district}
                  </div>
                  <div className="text-xs text-neutral-500">{formatDate(o.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{taka(o.total)}</div>
                  <div className="text-xs text-neutral-600">ক্যাশ: {taka(o.cod_due)}</div>
                  <div className="mt-1">
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={link({ page: page - 1 })} className="underline">
              ← আগের
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">
            {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={link({ page: page + 1 })} className="underline">
              পরের →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
    }
    
