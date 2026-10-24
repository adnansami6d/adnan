import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const IMAGE_HOSTS = ["i.ibb.co", "i.ibb.co.com", "placehold.co"];

const ERRORS: Record<string, string> = {
  NAME: "প্রোডাক্টের নাম লিখুন।",
  PRICE: "দাম সঠিক নয়।",
  COMPARE: "আগের দাম বর্তমান দামের চেয়ে কম হতে পারবে না।",
  IMAGE: "ছবির লিংক সঠিক নয়। শুধু imgbb এর সরাসরি লিংক (https://i.ibb.co/...) দিন।",
  VARIANT: "ভ্যারিয়েন্ট লাইন সঠিক নয়। নিয়ম: সাইজ,রঙ,স্টক (যেমন M,Black,10)।",
  NO_VARIANT: "কমপক্ষে একটা ভ্যারিয়েন্ট দিন।",
  DUPLICATE_VARIANT: "একই সাইজ ও রঙ দুইবার দেওয়া হয়েছে।",
  SAVE: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  FORBIDDEN: "অনুমতি নেই।",
};

function parseImages(raw: string): string[] | null {
  const urls: string[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    try {
      const u = new URL(line);
      if (u.protocol !== "https:" || !IMAGE_HOSTS.includes(u.hostname)) return null;
      urls.push(u.toString());
    } catch {
      return null;
    }
  }
  return urls;
}

type VariantRow = { size: string; color: string; stock: number; price: number | null };

function parseVariants(raw: string): VariantRow[] | "VARIANT" | "DUPLICATE_VARIANT" | "NO_VARIANT" {
  const rows: VariantRow[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [size, color, stockRaw, priceRaw] = line.split(",").map((s) => s.trim());
    const stock = Number(stockRaw);
    const price = priceRaw ? Number(priceRaw) : null;
    if (!size || !color || !/^\d+$/.test(stockRaw ?? "") || !Number.isInteger(stock) || stock > 100000) return "VARIANT";
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1000000)) return "VARIANT";
    const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
    if (seen.has(key)) return "DUPLICATE_VARIANT";
    seen.add(key);
    rows.push({ size, color, stock, price });
  }
  return rows.length ? rows : "NO_VARIANT";
}

function makeSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "product";
}

async function createProduct(formData: FormData) {
  "use server";
  const fail = (code: string): never => redirect(`/admin/products/new?err=${code}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") return fail("FORBIDDEN");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 150) return fail("NAME");

  const basePrice = Number(formData.get("base_price"));
  if (!Number.isInteger(basePrice) || basePrice < 0 || basePrice > 1000000) return fail("PRICE");

  const compareRaw = String(formData.get("compare_price") ?? "").trim();
  const comparePrice = compareRaw ? Number(compareRaw) : null;
  if (comparePrice !== null && (!Number.isInteger(comparePrice) || comparePrice < 0)) return fail("PRICE");
  if (comparePrice !== null && comparePrice < basePrice) return fail("COMPARE");

  const images = parseImages(String(formData.get("images") ?? ""));
  if (!images) return fail("IMAGE");

  const variants = parseVariants(String(formData.get("variants") ?? ""));
  if (typeof variants === "string") return fail(variants);

  const categoryId = Number(formData.get("category_id")) || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = formData.get("is_active") === "on";
  const isFeatured = formData.get("is_featured") === "on";

  // insert the product (retry once with a random suffix if the slug is taken)
  const baseSlug = makeSlug(name);
  let productId: number | null = null;
  for (let attempt = 0; attempt < 3 && productId === null; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    const { data, error } = await supabase
      .from("products")
      .insert({
        category_id: categoryId,
        name,
        slug,
        description,
        base_price: basePrice,
        compare_price: comparePrice,
        is_active: isActive,
        is_featured: isFeatured,
      })
      .select("id")
      .single();
    if (data) productId = data.id;
    else if (error?.code !== "23505") {
      console.error("create product failed:", error?.message);
      return fail("SAVE");
    }
  }
  if (productId === null) return fail("SAVE");

  const { error: vError } = await supabase.from("product_variants").insert(
    variants.map((v) => ({ product_id: productId, size: v.size, color: v.color, stock: v.stock, price: v.price }))
  );
  let iError = null;
  if (!vError && images.length) {
    const res = await supabase
      .from("product_images")
      .insert(images.map((url, i) => ({ product_id: productId, url, alt: name, sort_order: i })));
    iError = res.error;
  }
  if (vError || iError) {
    console.error("create product parts failed:", vError?.message ?? iError?.message);
    await supabase.from("products").delete().eq("id", productId); // clean up the half-saved product
    return fail("SAVE");
  }

  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(`/admin/products/${productId}`);
}

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name").order("sort_order");
  const errorText = err ? (ERRORS[err] ?? "কিছু একটা সমস্যা হয়েছে।") : null;

  return (
    <div className="max-w-xl">
      <Link href="/admin/products" className="text-sm underline">
        ← সব প্রোডাক্ট
      </Link>
      <h2 className="mb-4 mt-2 text-lg font-semibold">নতুন প্রোডাক্ট</h2>

      {errorText && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorText}</p>}

      <form action={createProduct} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">নাম *</span>
          <input name="name" required maxLength={150} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ক্যাটাগরি</span>
          <select name="category_id" className={inputClass} defaultValue="">
            <option value="">— নেই —</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">বিবরণ</span>
          <textarea name="description" rows={3} className={inputClass} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">দাম (টাকা) *</span>
            <input name="base_price" type="number" inputMode="numeric" min={0} required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">আগের দাম (ঐচ্ছিক)</span>
            <input name="compare_price" type="number" inputMode="numeric" min={0} className={inputClass} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ছবির লিংক (প্রতি লাইনে একটা, প্রথমটা মূল ছবি)</span>
          <textarea
            name="images"
            rows={3}
            placeholder="https://i.ibb.co/xxxx/photo.jpg"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ভ্যারিয়েন্ট * (প্রতি লাইনে একটা: সাইজ,রঙ,স্টক)</span>
          <textarea
            name="variants"
            rows={5}
            required
            placeholder={"M,Black,10\nL,Black,8\nM,White,5"}
            className={`${inputClass} font-mono`}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            আলাদা দাম লাগলে শেষে যোগ করুন: XL,Black,5,1200
          </span>
        </label>

        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked /> সাইটে চালু
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_featured" /> ফিচার্ড
          </label>
        </div>

        <button className="w-full rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700">
          প্রোডাক্ট সংরক্ষণ করুন
        </button>
      </form>
    </div>
  );
  }
