import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { pinToPassword } from "@/lib/auth-server";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  pin_done: { ok: true, text: "নতুন পিন সেট হয়েছে এবং অ্যাকাউন্ট আনলক হয়েছে।" },
  unlock_done: { ok: true, text: "অ্যাকাউন্ট আনলক হয়েছে।" },
  BAD_PIN: { ok: false, text: "পিন অবশ্যই ৪টা সংখ্যা হতে হবে।" },
  NOT_FOUND: { ok: false, text: "কাস্টমার পাওয়া যায়নি।" },
  FORBIDDEN: { ok: false, text: "অনুমতি নেই।" },
  SAVE: { ok: false, text: "কাজটি করা যায়নি। আবার চেষ্টা করুন।" },
};

/** Only a logged-in admin may run these actions (checked again here, not only in the layout). */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.app_metadata?.role === "admin";
}

async function resetPin(formData: FormData) {
  "use server";
  const go = (code: string): never => redirect(`/admin/users?msg=${code}`);
  if (!(await requireAdmin())) return go("FORBIDDEN");

  const userId = String(formData.get("user_id") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!/^[0-9]{4}$/.test(pin)) return go("BAD_PIN");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, phone").eq("id", userId).maybeSingle();
  if (!profile?.phone) return go("NOT_FOUND");

  const { error } = await admin.auth.admin.updateUserById(profile.id, {
    password: pinToPassword(profile.phone, pin),
  });
  if (error) {
    console.error("admin users: set pin failed:", error.message);
    return go("SAVE");
  }
  await admin.rpc("auth_reset_attempts", { p_user: profile.id });
  revalidatePath("/admin/users");
  return go("pin_done");
}

async function unlockOnly(formData: FormData) {
  "use server";
  const go = (code: string): never => redirect(`/admin/users?msg=${code}`);
  if (!(await requireAdmin())) return go("FORBIDDEN");

  const userId = String(formData.get("user_id") ?? "");
  const { error } = await createAdminClient().rpc("auth_reset_attempts", { p_user: userId });
  if (error) {
    console.error("admin users: unlock failed:", error.message);
    return go("SAVE");
  }
  revalidatePath("/admin/users");
  return go("unlock_done");
}

type SearchParams = Promise<{ q?: string; page?: string; msg?: string }>;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireAdmin())) redirect("/");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 40);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const message = sp.msg ? MESSAGES[sp.msg] : null;

  let query = createAdminClient()
    .from("profiles")
    .select("id, full_name, phone, created_at, failed_attempts, is_locked, locked_until", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`);

  const { data, count, error } = await query;
  const users = data ?? [];
  const lastPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const now = Date.now();

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const str = params.toString();
    return `/admin/users${str ? `?${str}` : ""}`;
  };

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">কাস্টমার ({count ?? 0})</h2>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-3 rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      <form action="/admin/users" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="ফোন নম্বর বা নাম"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">খুঁজুন</button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">কাস্টমার আনা যায়নি।</p>}
      {!error && users.length === 0 && <p className="text-sm text-neutral-600">কাউকে পাওয়া যায়নি।</p>}

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {users.map((u) => {
          const waiting = !u.is_locked && u.locked_until && new Date(u.locked_until).getTime() > now;
          return (
            <li key={u.id} className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{u.full_name || "(নাম নেই)"}</div>
                  <div className="text-neutral-600">{u.phone ?? "ফোন নেই"}</div>
                  <div className="text-xs text-neutral-500">{formatDate(u.created_at)}</div>
                </div>
                <div className="text-right text-xs">
                  {u.is_locked ? (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">লক হয়েছে</span>
                  ) : waiting ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">১ ঘণ্টার অপেক্ষা</span>
                  ) : u.failed_attempts > 0 ? (
                    <span className="text-neutral-600">ভুল চেষ্টা: {u.failed_attempts}</span>
                  ) : null}
                </div>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs underline">পিন রিসেট / আনলক</summary>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <form action={resetPin} className="flex items-end gap-2">
                    <input type="hidden" name="user_id" value={u.id} />
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-600">নতুন ৪ সংখ্যার পিন</span>
                      <input
                        name="pin"
                        inputMode="numeric"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        required
                        autoComplete="off"
                        className="w-24 rounded border border-neutral-300 px-2 py-1"
                      />
                    </label>
                    <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white">পিন বদলান</button>
                  </form>
                  {(u.is_locked || waiting || u.failed_attempts > 0) && (
                    <form action={unlockOnly}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs">শুধু আনলক</button>
                    </form>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

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
    
