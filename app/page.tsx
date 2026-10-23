import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductCard, { PRODUCT_SUMMARY_SELECT, type ProductSummary } from "@/components/ProductCard";
import { buttonClasses } from "@/components/Button";

async function getFeaturedProducts(): Promise<{ products: ProductSummary[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SUMMARY_SELECT)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) return { products: [], error: error.message };
    return { products: (data ?? []) as unknown as ProductSummary[], error: null };
  } catch (e) {
    return { products: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function HomePage() {
  const { products, error } = await getFeaturedProducts();

  return (
    <div>
      <section className="bg-neutral-100">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            আপনার পছন্দের পোশাক, দরজায় পৌঁছে যাবে
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-neutral-600">
            টি-শার্ট ও হুডি। ক্যাশ অন ডেলিভারি, সারা বাংলাদেশে ডেলিভারি।
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/products" className={buttonClasses("primary", "lg")}>
              সব প্রোডাক্ট দেখুন
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">জনপ্রিয় প্রোডাক্ট</h2>

        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            প্রোডাক্ট লোড করা যায়নি। ({error})
          </p>
        )}

        {!error && products.length === 0 && (
          <p className="text-neutral-500">এখনো কোনো প্রোডাক্ট যোগ করা হয়নি।</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
        }
      
