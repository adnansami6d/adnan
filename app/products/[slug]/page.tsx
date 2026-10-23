import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductPurchase, { type Img, type Variant } from "@/components/ProductPurchase";

type Category = { name: string; slug: string };
type Row = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  compare_price: number | null;
  categories: Category | Category[] | null;
  product_images: Img[];
  product_variants: (Variant & { is_active: boolean })[];
};

// cache(): the page and generateMetadata share one database call
const getProduct = cache(async (slug: string): Promise<Row | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, base_price, compare_price, categories(name, slug), product_images(url, alt, color, sort_order), product_variants(id, size, color, color_hex, price, stock, is_active)"
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return (data as unknown as Row) ?? null;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "প্রোডাক্ট পাওয়া যায়নি" };
  return {
    title: product.name,
    description: product.description?.slice(0, 160) ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  const variants = (product.product_variants ?? []).filter((v) => v.is_active);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-4 text-sm text-neutral-500" aria-label="breadcrumb">
        <Link href="/" className="hover:underline">
          হোম
        </Link>
        {" / "}
        <Link href="/products" className="hover:underline">
          প্রোডাক্ট
        </Link>
        {category && (
          <>
            {" / "}
            <Link href={`/products?category=${category.slug}`} className="hover:underline">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{product.name}</h1>

      <ProductPurchase
        product={{
          id: product.id,
          slug: product.slug,
          name: product.name,
          basePrice: product.base_price,
          comparePrice: product.compare_price,
        }}
        variants={variants}
        images={product.product_images ?? []}
      />

      {product.description && (
        <section className="mt-10 max-w-2xl">
          <h2 className="mb-2 text-lg font-semibold">বিবরণ</h2>
          <p className="whitespace-pre-line text-neutral-700">{product.description}</p>
        </section>
      )}
    </div>
  );
}
  
