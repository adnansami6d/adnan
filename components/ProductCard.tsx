import Image from "next/image";
import Link from "next/link";
import { taka } from "@/lib/format";

export type ProductSummary = {
  id: number;
  name: string;
  slug: string;
  base_price: number;
  compare_price: number | null;
  product_images: { url: string; alt: string | null; sort_order: number }[];
};

/** Select string to use with supabase when you need ProductSummary rows */
export const PRODUCT_SUMMARY_SELECT =
  "id, name, slug, base_price, compare_price, product_images(url, alt, sort_order)";

export default function ProductCard({ product }: { product: ProductSummary }) {
  const img = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  const onSale = product.compare_price !== null && product.compare_price > product.base_price;

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100">
        {img && (
          <Image
            src={img.url}
            alt={img.alt ?? product.name}
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
      <h3 className="mt-2 line-clamp-1 font-medium">{product.name}</h3>
      <p className="text-sm">
        <span className="font-semibold">{taka(product.base_price)}</span>
        {onSale && (
          <span className="ml-2 text-neutral-400 line-through">
            {taka(product.compare_price as number)}
          </span>
        )}
      </p>
    </Link>
  );
}
