import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ProductCard, { PRODUCT_SUMMARY_SELECT, type ProductSummary } from "@/components/ProductCard";
import FilterBar from "@/components/FilterBar";
import { buttonClasses } from "@/components/Button";

export const metadata: Metadata = { title: "সব প্রোডাক্ট" };

const PAGE_SIZE = 12;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Category = { id: number; name: string; slug: string };

async function loadData(q: string, categorySlug: string, sort: string, page: number) {
  try {
    const supabase = await createClient();

    const { data: cats } = await supabase
      .from("categories")
      .select("id, name, slug")
      .order("sort_order", { ascending: true });
    const categories = (cats ?? []) as Category[];

    let query = supabase
      .from("products")
      .select(PRODUCT_SUMMARY_SELECT, { count: "exact" })
      .eq("is_active", true);

    if (q) query = query.ilike("name", `%${q}%`);

    const category = categories.find((c) => c.slug === categorySlug);
    if (category) query = query.eq("category_id", category.id);

    if (sort === "price_asc") query = query.order("base_price", { ascending: true });
    else if (sort === "price_desc") query = query.order("base_price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) return { categories, products: [] as ProductSummary[], total: 0, error: error.message };
    return {
      categories,
      products: (data ?? []) as unknown as ProductSummary[],
      total: count ?? 0,
      error: null as string | null,
    };
  } catch (e) {
    return {
      categories: [] as Category[],
      products: [] as ProductSummary[],
      total: 0,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // keep the search text safe for ilike (no wildcards from the visitor)
  const q = first(sp.q).replace(/[%_\\]/g, " ").trim().slice(0, 60);
  const categorySlug = first(sp.category);
  const sort = first(sp.sort);
  const page = Math.max(1, parseInt(first(sp.page) || "1", 10) || 1);

  const { categories, products, total, error } = await loadData(q, categorySlug, sort, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categorySlug) params.set("category", categorySlug);
    if (sort) params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">সব প্রোডাক্ট</h1>

      <FilterBar categories={categories} q={q} category={categorySlug} sort={sort} />

      <p className="mb-4 mt-4 text-sm text-neutral-500">
        {error ? "" : `${total}টি প্রোডাক্ট`}
        {q && ` · "${q}"`}
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          প্রোডাক্ট লোড করা যায়নি। ({error})
        </p>
      )}

      {!error && products.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
          কোনো প্রোডাক্ট পাওয়া যায়নি।
          <div className="mt-4">
            <Link href="/products" className={buttonClasses("outline", "sm")}>
              সব প্রোডাক্ট দেখুন
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-4 text-sm" aria-label="পেজ">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClasses("outline", "sm")}>
              ← আগের
            </Link>
          ) : (
            <span className="w-16" />
          )}
          <span className="text-neutral-600">
            পৃষ্ঠা {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={buttonClasses("outline", "sm")}>
              পরের →
            </Link>
          ) : (
            <span className="w-16" />
          )}
        </nav>
      )}
    </div>
  );
             }
      
