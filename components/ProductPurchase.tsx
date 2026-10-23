"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/cart";
import { taka } from "@/lib/format";
import Button, { buttonClasses } from "./Button";

export type Variant = {
  id: number;
  size: string;
  color: string;
  color_hex: string | null;
  price: number | null; // null = use the product base price
  stock: number;
};

export type Img = {
  url: string;
  alt: string | null;
  color: string | null; // null = shown for every color
  sort_order: number;
};

type Props = {
  product: { id: number; slug: string; name: string; basePrice: number; comparePrice: number | null };
  variants: Variant[];
  images: Img[];
};

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  return i === -1 ? 99 : i;
};

export default function ProductPurchase({ product, variants, images }: Props) {
  const router = useRouter();

  const colors = useMemo(() => {
    const map = new Map<string, string | null>();
    variants.forEach((v) => {
      if (!map.has(v.color)) map.set(v.color, v.color_hex);
    });
    return [...map.entries()].map(([name, hex]) => ({ name, hex }));
  }, [variants]);

  const firstAvailableColor =
    colors.find((c) => variants.some((v) => v.color === c.name && v.stock > 0))?.name ??
    colors[0]?.name ??
    "";

  const [color, setColor] = useState(firstAvailableColor);
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [imgIndex, setImgIndex] = useState(0);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const sizes = useMemo(
    () =>
      variants
        .filter((v) => v.color === color)
        .sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size)),
    [variants, color]
  );

  const selected = sizes.find((v) => v.size === size) ?? null;

  const displayImages = useMemo(() => {
    const forColor = images.filter((i) => i.color === null || i.color === color);
    const list = forColor.length > 0 ? forColor : images;
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
  }, [images, color]);

  const currentImage = displayImages[imgIndex] ?? displayImages[0];
  const price = selected?.price ?? product.basePrice;
  const onSale = product.comparePrice !== null && product.comparePrice > price;
  const maxQty = selected ? Math.max(1, Math.min(20, selected.stock)) : 20;

  function pickColor(name: string) {
    setColor(name);
    setSize("");
    setQty(1);
    setImgIndex(0);
    setMessage(null);
  }

  function pickSize(s: string) {
    setSize(s);
    setQty(1);
    setMessage(null);
  }

  function add(goCheckout: boolean) {
    if (!selected) {
      setMessage({ type: "error", text: "আগে সাইজ বাছাই করুন।" });
      return;
    }
    if (selected.stock < 1) {
      setMessage({ type: "error", text: "এই সাইজের স্টক শেষ।" });
      return;
    }
    if (qty > selected.stock) {
      setMessage({ type: "error", text: `সর্বোচ্চ ${selected.stock}টি নেওয়া যাবে।` });
      return;
    }

    addToCart(
      {
        variantId: selected.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        size: selected.size,
        color: selected.color,
        image: displayImages[0]?.url ?? null,
        price,
      },
      qty
    );

    if (goCheckout) {
      router.push("/checkout");
    } else {
      setMessage({ type: "ok", text: "কার্টে যোগ হয়েছে।" });
    }
  }

  if (variants.length === 0) {
    return <p className="rounded-lg bg-neutral-100 p-4 text-neutral-600">এই প্রোডাক্ট এখন পাওয়া যাচ্ছে না।</p>;
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100">
          {currentImage && (
            <Image
              src={currentImage.url}
              alt={currentImage.alt ?? product.name}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
              unoptimized={currentImage.url.includes("placehold.co")}
            />
          )}
        </div>
        {displayImages.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {displayImages.map((img, i) => (
              <button
                key={img.url + i}
                type="button"
                onClick={() => setImgIndex(i)}
                aria-label={`ছবি ${i + 1}`}
                className={`relative aspect-square overflow-hidden rounded border-2 ${
                  i === imgIndex ? "border-neutral-900" : "border-transparent"
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? product.name}
                  fill
                  sizes="20vw"
                  className="object-cover"
                  unoptimized={img.url.includes("placehold.co")}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Choices */}
      <div>
        <p className="text-2xl font-bold">
          {taka(price)}
          {onSale && (
            <span className="ml-3 text-lg font-normal text-neutral-400 line-through">
              {taka(product.comparePrice as number)}
            </span>
          )}
        </p>

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">রং: {color}</p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => pickColor(c.name)}
                aria-pressed={c.name === color}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  c.name === color ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
                }`}
              >
                {c.hex && (
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-neutral-300"
                    style={{ backgroundColor: c.hex }}
                  />
                )}
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">সাইজ{size ? `: ${size}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((v) => {
              const out = v.stock < 1;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={out}
                  onClick={() => pickSize(v.size)}
                  aria-pressed={v.size === size}
                  className={`min-w-12 rounded-lg border px-3 py-1.5 text-sm ${
                    v.size === size ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                  } ${out ? "cursor-not-allowed text-neutral-300 line-through" : ""}`}
                >
                  {v.size}
                </button>
              );
            })}
          </div>
          {selected && (
            <p className={`mt-2 text-sm ${selected.stock <= 5 ? "text-red-600" : "text-green-700"}`}>
              {selected.stock < 1
                ? "স্টক শেষ"
                : selected.stock <= 5
                  ? `মাত্র ${selected.stock}টি বাকি`
                  : "স্টকে আছে"}
            </p>
          )}
        </div>

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">পরিমাণ</p>
          <div className="inline-flex items-center rounded-lg border border-neutral-300">
            <button
              type="button"
              className="px-3 py-2 disabled:opacity-40"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="কমান"
            >
              −
            </button>
            <span className="min-w-10 text-center">{qty}</span>
            <button
              type="button"
              className="px-3 py-2 disabled:opacity-40"
              disabled={qty >= maxQty}
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              aria-label="বাড়ান"
            >
              +
            </button>
          </div>
        </div>

        {message && (
          <p
            role="status"
            className={`mt-4 rounded-lg p-3 text-sm ${
              message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
            {message.type === "ok" && (
              <Link href="/cart" className="ml-2 font-medium underline">
                কার্ট দেখুন
              </Link>
            )}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => add(false)} className="flex-1">
            কার্টে যোগ করুন
          </Button>
          <Button size="lg" variant="outline" onClick={() => add(true)} className="flex-1">
            এখনই কিনুন
          </Button>
        </div>

        <Link href="/products" className={`${buttonClasses("ghost", "sm")} mt-4`}>
          ← সব প্রোডাক্ট
        </Link>
      </div>
    </div>
  );
  }
  
