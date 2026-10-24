import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { taka } from "@/lib/format";
import { buttonClasses } from "@/components/Button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 50);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, name, slug, base_price, is_active, is_featured, product_variants(stock)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, count, error } = await query;
  const products = data ?? [];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const str = params.toString();
    return `/admin/products${str ? `?${str}` : ""}`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">প্রোডাক্ট ({total})</h2>
        <Link href="/admin/products/new" className={buttonClasses("primary", "sm")}>
          + নতুন প্রোডাক্ট
        </Link>
      </div>

      <form action="/admin/products" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="প্রোডাক্টের নাম"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">খুঁজুন</button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">প্রোডাক্ট আনা যায়নি। আবার চেষ্টা করুন।</p>}

      {!error && products.length === 0 ? (
        <p className="text-sm text-neutral-600">কোনো প্রোডাক্ট নেই।</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {products.map((p) => {
            const variants = (p.product_variants ?? []) as { stock: number }[];
            const stock = variants.reduce((sum, v) => sum + v.stock, 0);
            return (
              <li key={p.id}>
                <Link href={`/admin/products/${p.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-neutral-50">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-neutral-600">
                      {taka(p.base_price)} · {variants.length} ভ্যারিয়েন্ট
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={stock === 0 ? "font-medium text-red-700" : "text-neutral-700"}>
                      স্টক: {stock}
                    </div>
                    <div className={p.is_active ? "text-green-700" : "text-neutral-500"}>
                      {p.is_active ? "চালু" : "বন্ধ"}
                      {p.is_featured ? " · ফিচার্ড" : ""}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} className="underline">
              ← আগের
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">
            {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={pageLink(page + 1)} className="underline">
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
                            
