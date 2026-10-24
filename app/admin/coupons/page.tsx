import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taka, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  created: { ok: true, text: "কুপন তৈরি হয়েছে।" },
  toggled: { ok: true, text: "কুপন আপডেট হয়েছে।" },
  CODE: { ok: false, text: "কোড ৩–২০টা ইংরেজি অক্ষর বা সংখ্যা হতে হবে।" },
  VALUE: { ok: false, text: "ছাড়ের পরিমাণ সঠিক নয়। শতাংশ হলে ১–১০০ হতে হবে।" },
  NUMBERS: { ok: false, text: "সর্বোচ্চ ছাড়, ন্যূনতম অর্ডার বা ব্যবহারের সীমা সঠিক নয়।" },
  DATE: { ok: false, text: "তারিখ সঠিক নয়।" },
  DUPLICATE: { ok: false, text: "এই কোড আগেই আছে।" },
  FORBIDDEN: { ok: false, text: "অনুমতি নেই।" },
  SAVE: { ok: false, text: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" },
};

const optInt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};
const validInt = (n: number | null, min: number, max: number) =>
  n === null || (Number.isInteger(n) && n >= min && n <= max);

async function adminClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && user.app_metadata?.role === "admin" ? supabase : null;
}

async function createCoupon(formData: FormData) {
  "use server";
  const go = (code: string): never => redirect(`/admin/coupons?msg=${code}`);
  const supabase = await adminClient();
  if (!supabase) return go("FORBIDDEN");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return go("CODE");

  const type = formData.get("type") === "percent" ? "percent" : "fixed";
  const value = Number(formData.get("value"));
  if (!Number.isInteger(value) || value < 1 || value > (type === "percent" ? 100 : 1000000)) return go("VALUE");

  const maxDiscount = optInt(formData.get("max_discount"));
  const minOrder = optInt(formData.get("min_order")) ?? 0;
  const usageLimit = optInt(formData.get("usage_limit"));
  if (!validInt(maxDiscount, 1, 1000000) || !validInt(minOrder, 0, 1000000) || !validInt(usageLimit, 1, 1000000)) {
    return go("NUMBERS");
  }

  const expiresRaw = String(formData.get("expires_on") ?? "").trim();
  let expiresAt: string | null = null;
  if (expiresRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) return go("DATE");
    const d = new Date(`${expiresRaw}T23:59:59+06:00`); // end of that day, Bangladesh time
    if (Number.isNaN(d.getTime())) return go("DATE");
    expiresAt = d.toISOString();
  }

  const { error } = await supabase.from("coupons").insert({
    code,
    type,
    value,
    max_discount: type === "percent" ? maxDiscount : null,
    min_order: minOrder,
    usage_limit: usageLimit,
    expires_at: expiresAt,
    is_active: true,
  });
  if (error) {
    if (error.code === "23505") return go("DUPLICATE");
    console.error("create coupon failed:", error.message);
    return go("SAVE");
  }
  revalidatePath("/admin/coupons");
  return go("created");
}

async function toggleCoupon(formData: FormData) {
  "use server";
  const go = (code: string): never => redirect(`/admin/coupons?msg=${code}`);
  const supabase = await adminClient();
  if (!supabase) return go("FORBIDDEN");

  const id = Number(formData.get("id"));
  const makeActive = formData.get("to") === "on";
  if (!Number.isInteger(id) || id <= 0) return go("SAVE");

  const { error } = await supabase.from("coupons").update({ is_active: makeActive }).eq("id", id);
  if (error) {
    console.error("toggle coupon failed:", error.message);
    return go("SAVE");
  }
  revalidatePath("/admin/coupons");
  return go("toggled");
}

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const message = msg ? MESSAGES[msg] : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, type, value, max_discount, min_order, usage_limit, used_count, expires_at, is_active")
    .order("created_at", { ascending: false });
  const coupons = data ?? [];
  const now = Date.now();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">কুপন</h2>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      <details className="rounded-lg border border-neutral-200 p-3">
        <summary className="cursor-pointer font-medium">+ নতুন কুপন</summary>
        <form action={createCoupon} className="mt-3 max-w-md space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">কোড * (ইংরেজি অক্ষর/সংখ্যা)</span>
            <input name="code" required maxLength={20} className={`${inputClass} uppercase`} placeholder="EID100" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">ধরন *</span>
              <select name="type" className={inputClass} defaultValue="fixed">
                <option value="fixed">টাকা (ফিক্সড)</option>
                <option value="percent">শতাংশ (%)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">পরিমাণ *</span>
              <input name="value" type="number" inputMode="numeric" min={1} required className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">সর্বোচ্চ ছাড় (শুধু %)</span>
              <input name="max_discount" type="number" inputMode="numeric" min={1} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">ন্যূনতম অর্ডার</span>
              <input name="min_order" type="number" inputMode="numeric" min={0} className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">ব্যবহারের সীমা</span>
              <input name="usage_limit" type="number" inputMode="numeric" min={1} className={inputClass} placeholder="ফাঁকা = অসীম" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">শেষ তারিখ</span>
              <input name="expires_on" type="date" className={inputClass} />
            </label>
          </div>
          <button className="w-full rounded-lg bg-neutral-900 px-6 py-2.5 text-white hover:bg-neutral-700">
            কুপন তৈরি করুন
          </button>
        </form>
      </details>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">কুপন আনা যায়নি। আবার চেষ্টা করুন।</p>}
      {!error && coupons.length === 0 && <p className="text-sm text-neutral-600">এখনো কোনো কুপন নেই।</p>}

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {coupons.map((c) => {
          const expired = c.expires_at && new Date(c.expires_at).getTime() < now;
          const used = c.usage_limit !== null && c.used_count >= c.usage_limit;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-mono font-semibold">{c.code}</div>
                <div className="text-neutral-600">
                  {c.type === "percent"
                    ? `${c.value}%${c.max_discount ? ` (সর্বোচ্চ ${taka(c.max_discount)})` : ""}`
                    : taka(c.value)}
                  {c.min_order > 0 ? ` · ন্যূনতম ${taka(c.min_order)}` : ""}
                </div>
                <div className="text-xs text-neutral-500">
                  ব্যবহার: {c.used_count}
                  {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                  {c.expires_at ? ` · শেষ: ${formatDate(c.expires_at)}` : ""}
                </div>
                <div className="mt-1 text-xs">
                  {expired ? (
                    <span className="text-red-700">মেয়াদ শেষ</span>
                  ) : used ? (
                    <span className="text-red-700">সীমা শেষ</span>
                  ) : c.is_active ? (
                    <span className="text-green-700">চালু</span>
                  ) : (
                    <span className="text-neutral-500">বন্ধ</span>
                  )}
                </div>
              </div>
              <form action={toggleCoupon}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="to" value={c.is_active ? "off" : "on"} />
                <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100">
                  {c.is_active ? "বন্ধ করুন" : "চালু করুন"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
