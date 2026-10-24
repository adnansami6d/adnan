import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { taka } from "@/lib/format";
import { STATUS_LABEL } from "@/components/OrderStatus";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;

export default async function AdminDashboard() {
  const supabase = await createClient();

  const count = (table: string, filter?: (q: any) => any) => {
    let q: any = supabase.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };

  const [statusCounts, topups, products, customers, recent] = await Promise.all([
    Promise.all(STATUSES.map((s) => count("orders", (q) => q.eq("status", s)))),
    count("wallet_topups", (q) => q.eq("status", "pending")),
    count("products"),
    count("profiles"),
    supabase
      .from("orders")
      .select("order_number, customer_name, phone, total, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, statusCounts[i].count ?? 0]));
  const orders = recent.data ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-semibold">অর্ডার</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/orders?status=${s}`}
              className="rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50"
            >
              <div className="text-2xl font-bold">{byStatus[s]}</div>
              <div className="text-sm text-neutral-600">{STATUS_LABEL[s]}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/admin/topups" className="rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
          <div className="text-2xl font-bold">{topups.count ?? 0}</div>
          <div className="text-sm text-neutral-600">অপেক্ষমাণ টপআপ</div>
        </Link>
        <Link href="/admin/products" className="rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
          <div className="text-2xl font-bold">{products.count ?? 0}</div>
          <div className="text-sm text-neutral-600">প্রোডাক্ট</div>
        </Link>
        <Link href="/admin/users" className="rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
          <div className="text-2xl font-bold">{customers.count ?? 0}</div>
          <div className="text-sm text-neutral-600">কাস্টমার</div>
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">সাম্প্রতিক অর্ডার</h2>
          <Link href="/admin/orders" className="text-sm underline">
            সব দেখুন
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-neutral-600">এখনো কোনো অর্ডার নেই।</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {orders.map((o) => (
              <li key={o.order_number} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="font-medium">{o.order_number}</div>
                  <div className="text-neutral-600">
                    {o.customer_name} · {o.phone}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{taka(o.total)}</div>
                  <div className="text-neutral-600">{STATUS_LABEL[o.status] ?? o.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
          }
                            
