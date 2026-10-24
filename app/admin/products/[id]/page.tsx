import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const IMAGE_HOSTS = ["i.ibb.co", "i.ibb.co.com", "placehold.co"];

const ERRORS: Record<string, string> = {
  NAME: "প্রোডাক্টের নাম লিখুন।",
  PRICE: "দাম সঠিক নয়।",
  COMPARE: "আগের দাম বর্তমান দামের চেয়ে কম হতে পারবে না।",
  IMAGE: "ছবির লিংক সঠিক নয়। শুধু imgbb এর সরাসরি লিংক (https://i.ibb.co/...) দিন।",
  VARIANT: "ভ্যারিয়েন্টের স্টক বা দাম সঠিক নয়।",
  NEW_VARIANT: "নতুন ভ্যারিয়েন্ট লাইন সঠিক নয়। নিয়ম: সাইজ,রঙ,স্টক (যেমন M,Black,10)।",
  DUPLICATE_VARIANT: "এই সাইজ ও রঙ আগেই আছে।",
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

const intOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

async function saveProduct(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const back = `/admin/products/${id}`;
  const fail = (code: string): never => redirect(`${back}?err=${code}`);
  if (!Number.isInteger(id) || id <= 0) return redirect("/admin/products");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") return fail("FORBIDDEN");

  // ----- product fields -----
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 150) return fail("NAME");
  const basePrice = Number(formData.get("base_price"));
  if (!Number.isInteger(basePrice) || basePrice < 0 || basePrice > 1000000) return fail("PRICE");
  const comparePrice = intOrNull(formData.get("compare_price"));
  if (comparePrice !== null && (!Number.isInteger(comparePrice) || comparePrice < 0)) return fail("PRICE");
  if (comparePrice !== null && comparePrice < basePrice) return fail("COMPARE");

  const images = parseImages(String(formData.get("images") ?? ""));
  if (!images) return fail("IMAGE");

  // ----- existing variants: read stock / price / active from the form -----
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id, size, color")
    .eq("product_id", id);
  const variantUpdates: { id: number; stock: number; price: number | null; is_active: boolean }[] = [];
  for (const v of existing ?? []) {
    const stock = Number(formData.get(`v_${v.id}_stock`));
    const price = intOrNull(formData.get(`v_${v.id}_price`));
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return fail("VARIANT");
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1000000)) return fail("VARIANT");
    variantUpdates.push({ id: v.id, stock, price, is_active: formData.get(`v_${v.id}_active`) === "on" });
  }

  // ----- new variants (optional) -----
  const taken = new Set((existing ?? []).map((v) => `${v.size.toLowerCase()}|${v.color.toLowerCase()}`));
  const newRows: { product_id: number; size: string; color: string; stock: number; price: number | null }[] = [];
  for (const line of String(formData.get("new_variants") ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [size, color, stockRaw, priceRaw] = line.split(",").map((s) => s.trim());
    const stock = Number(stockRaw);
    const price = priceRaw ? Number(priceRaw) : null;
    if (!size || !color || !/^\d+$/.test(stockRaw ?? "") || stock > 100000) return fail("NEW_VARIANT");
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1000000)) return fail("NEW_VARIANT");
    const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
    if (taken.has(key)) return fail("DUPLICATE_VARIANT");
    taken.add(key);
    newRows.push({ product_id: id, size, color, stock, price });
  }

  // ----- write -----
  const { error: pError } = await supabase
    .from("products")
    .update({
      category_id: Number(formData.get("category_id")) || null,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      base_price: basePrice,
      compare_price: comparePrice,
      is_active: formData.get("is_active") === "on",
      is_featured: formData.get("is_featured") === "on",
    })
    .eq("id", id);
  if (pError) {
    console.error("update product failed:", pError.message);
    return fail("SAVE");
  }

  const results = await Promise.all(
    variantUpdates.map((v) =>
      supabase.from("product_variants").update({ stock: v.stock, price: v.price, is_active: v.is_active }).eq("id", v.id)
    )
  );
  if (results.some((r) => r.error)) {
    console.error("update variants failed:", results.find((r) => r.error)?.error?.message);
    return fail("SAVE");
  }

  if (newRows.length) {
    const { error } = await supabase.from("product_variants").insert(newRows);
    if (error) {
      console.error("insert variants failed:", error.message);
      return fail("SAVE");
    }
  }

  // images: add the new list first, then remove the old rows (so a failure never leaves the product without photos)
  const { data: oldImages } = await supabase.from("product_images").select("id").eq("product_id", id);
  if (images.length) {
    const { error } = await supabase
      .from("product_images")
      .insert(images.map((url, i) => ({ product_id: id, url, alt: name, sort_order: i })));
    if (error) {
      console.error("insert images failed:", error.message);
      return fail("SAVE");
    }
  }
  const oldIds = (oldImages ?? []).map((r) => r.id);
  if (oldIds.length) await supabase.from("product_images").delete().in("id", oldIds);

  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(`${back}?saved=1`);
}

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; saved?: string }>;
};

export default async function EditProductPage({ params, searchParams }: Props) {
  const { id: idRaw } = await params;
  const { err, saved } = await searchParams;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const [{ data: product }, { data: variants }, { data: images }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_variants").select("id, size, color, stock, price, is_active").eq("product_id", id).order("id"),
    supabase.from("product_images").select("url").eq("product_id", id).order("sort_order"),
    supabase.from("categories").select("id, name").order("sort_order"),
  ]);
  if (!product) notFound();

  const errorText = err ? (ERRORS[err] ?? "কিছু একটা সমস্যা হয়েছে।") : null;

  return (
    <div className="max-w-xl">
      <Link href="/admin/products" className="text-sm underline">
        ← সব প্রোডাক্ট
      </Link>
      <div className="mb-4 mt-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">প্রোডাক্ট এডিট</h2>
        <Link href={`/products/${product.slug}`} className="text-sm underline" target="_blank">
          সাইটে দেখুন
        </Link>
      </div>

      {saved && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">সংরক্ষণ হয়েছে।</p>}
      {errorText && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorText}</p>}

      <form action={saveProduct} className="space-y-4">
        <input type="hidden" name="id" value={product.id} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium">নাম *</span>
          <input name="name" required maxLength={150} defaultValue={product.name} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ক্যাটাগরি</span>
          <select name="category_id" className={inputClass} defaultValue={product.category_id ?? ""}>
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
          <textarea name="description" rows={3} defaultValue={product.description ?? ""} className={inputClass} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">দাম (টাকা) *</span>
            <input
              name="base_price"
              type="number"
              inputMode="numeric"
              min={0}
              required
              defaultValue={product.base_price}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">আগের দাম (ঐচ্ছিক)</span>
            <input
              name="compare_price"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={product.compare_price ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ছবির লিংক (প্রতি লাইনে একটা, প্রথমটা মূল ছবি)</span>
          <textarea
            name="images"
            rows={3}
            defaultValue={(images ?? []).map((i) => i.url).join("\n")}
            className={inputClass}
          />
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium">ভ্যারিয়েন্ট ও স্টক</span>
          <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {(variants ?? []).map((v) => (
              <div key={v.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 p-2 text-sm">
                <span className="font-medium">
                  {v.size} · {v.color}
                </span>
                <label className="flex items-center gap-1">
                  <span className="text-xs text-neutral-500">স্টক</span>
                  <input
                    name={`v_${v.id}_stock`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    required
                    defaultValue={v.stock}
                    className="w-16 rounded border border-neutral-300 px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-xs text-neutral-500">দাম</span>
                  <input
                    name={`v_${v.id}_price`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={v.price ?? ""}
                    placeholder="ডিফল্ট"
                    className="w-20 rounded border border-neutral-300 px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name={`v_${v.id}_active`} defaultChecked={v.is_active} /> চালু
                </label>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">দাম ফাঁকা রাখলে প্রোডাক্টের মূল দাম ধরা হবে।</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">নতুন ভ্যারিয়েন্ট যোগ (প্রতি লাইনে: সাইজ,রঙ,স্টক)</span>
          <textarea name="new_variants" rows={3} placeholder="XL,Black,10" className={`${inputClass} font-mono`} />
        </label>

        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked={product.is_active} /> সাইটে চালু
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_featured" defaultChecked={product.is_featured} /> ফিচার্ড
          </label>
        </div>

        <button className="w-full rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700">
          সংরক্ষণ করুন
        </button>
      </form>
    </div>
  );
        }
  
