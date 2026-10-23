import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ProductImage = { url: string; alt: string | null; sort_order: number };
type Product = {
  id: number;
  name: string;
  slug: string;
  base_price: number;
  compare_price: number | null;
  product_images: ProductImage[];
};

const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;

async function getFeaturedProducts(): Promise<{ products: Product[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, base_price, compare_price, product_images(url, alt, sort_order)")
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) return { products: [], error: error.message };
    return { products: (data ?? []) as unknown as Product[], error: null };
  } catch (e) {
    return { products: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function HomePage() {
  const { products, error } = await getFeaturedProducts();

  return (
    <div>
      {/* Hero */}
      <section className="bg-neutral-100">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            আপনার পছন্দের পোশাক, দরজায় পৌঁছে যাবে
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-neutral-600">
            টি-শার্ট ও হুডি। ক্যাশ অন ডেলিভারি, সারা বাংলাদেশে ডেলিভারি।
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700"
            >
              সব প্রোডাক্ট দেখুন
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-neutral-300 px-6 py-3 font-medium hover:bg-white"
            >
              লগইন
            </Link>
          </div>
        </div>
      </section>

      {/* Featured products */}
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
          {products.map((p) => {
            const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
            const onSale = p.compare_price !== null && p.compare_price > p.base_price;

            return (
              <Link key={p.id} href={`/products/${p.slug}`} className="group block">
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100">
                  {img && (
                    <Image
                      src={img.url}
                      alt={img.alt ?? p.name}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      // placehold.co sends SVG, which Next.js will not optimize
                      unoptimized={img.url.includes("placehold.co")}
                    />
                  )}
                  {onSale && (
                    <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                      সেল
                    </span>
                  )}
                </div>
                <h3 className="mt-2 line-clamp-1 font-medium">{p.name}</h3>
                <p className="text-sm">
                  <span className="font-semibold">{taka(p.base_price)}</span>
                  {onSale && (
                    <span className="ml-2 text-neutral-400 line-through">
                      {taka(p.compare_price as number)}
                    </span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
