import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { taka, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "অপেক্ষমাণ" },
  { key: "approved", label: "অনুমোদিত" },
  { key: "rejected", label: "বাতিল" },
] as const;

const METHOD: Record<string, string> = { bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট" };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  approved: { ok: true, text: "টপআপ অনুমোদন হয়েছে, কয়েন যোগ হয়েছে।" },
  rejected: { ok: true, text: "টপআপ বাতিল করা হয়েছে।" },
  ALREADY_REVIEWED: { ok: false, text: "এটা আগেই দেখা হয়ে গেছে।" },
  TOPUP_NOT_FOUND: { ok: false, text: "টপআপ পাওয়া যায়নি।" },
  FORBIDDEN: { ok: false, text: "অনুমতি নেই।" },
  SAVE: { ok: false, text: "কাজটি করা যায়নি। আবার চেষ্টা করুন।" },
};

/** Runs on the server. The database function re-checks that the caller is an admin. */
async function review(formData: FormData) {
  "use server";
  const go = (code: string): never => redirect(`/admin/topups?msg=${code}`);

  const id = Number(formData.get("topup_id"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!Number.isInteger(id) || id <= 0) return go("TOPUP_NOT_FOUND");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_topup", { p_topup_id: id, p_approve: approve, p_note: note });

  revalidatePath("/admin/topups");
  if (error) {
    const code = ["ALREADY_REVIEWED", "TOPUP_NOT_FOUND", "FORBIDDEN"].find((c) => error.message.includes(c));
    if (!code) console.error("review_topup failed:", error.message);
    return go(code ?? "SAVE");
  }
  return go(approve ? "approved" : "rejected");
}

type SearchParams = Promise<{ status?: string; msg?: string }>;

export default async function AdminTopupsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "pending";
  const message = sp.msg ? MESSAGES[sp.msg] : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") redirect("/");

  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, user_id, amount, method, sender_number, trx_id, status, admin_note, created_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(100);
  const topups = data ?? [];

  // names / phones of the customers (wallet_topups points to auth users, not profiles)
  const ids = [...new Set(topups.map((t) => t.user_id))];
  const people = new Map<string, { full_name: string | null; phone: string | null }>();
  if (ids.length) {
    const { data: profiles } = await createAdminClient().from("profiles").select("id, full_name, phone").in("id", ids);
    for (const p of profiles ?? []) people.set(p.id, p);
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">টপআপ</h2>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-3 rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/topups?status=${t.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${status === t.key ? "bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">টপআপ আনা যায়নি। আবার চেষ্টা করুন।</p>}
      {!error && topups.length === 0 && <p className="text-sm text-neutral-600">কিছু নেই।</p>}

      <ul className="space-y-3">
        {topups.map((t) => {
          const person = people.get(t.user_id);
          return (
            <li key={t.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{person?.full_name || "(নাম নেই)"}</div>
                  <div className="text-neutral-600">{person?.phone ?? "-"}</div>
                  <div className="text-xs text-neutral-500">{formatDate(t.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{taka(t.amount)}</div>
                  <div className="text-xs text-neutral-600">{METHOD[t.method] ?? t.method}</div>
                </div>
              </div>

              <dl className="mt-2 space-y-1 rounded bg-neutral-50 p-2 text-xs">
                <div className="flex justify-between"><dt className="text-neutral-600">যে নম্বর থেকে পাঠিয়েছে</dt><dd>{t.sender_number}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-600">ট্রানজেকশন আইডি</dt><dd className="font-mono">{t.trx_id}</dd></div>
                {t.admin_note && (
                  <div className="flex justify-between"><dt className="text-neutral-600">নোট</dt><dd>{t.admin_note}</dd></div>
                )}
              </dl>

              {t.status === "pending" && (
                <form action={review} className="mt-3 space-y-2">
                  <input type="hidden" name="topup_id" value={t.id} />
                  <input
                    name="note"
                    maxLength={300}
                    placeholder="নোট (ঐচ্ছিক)"
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900"
                  />
                  <div className="flex gap-2">
                    <button
                      name="decision"
                      value="approve"
                      className="rounded-lg bg-green-600 px-4 py-2 text-xs text-white hover:bg-green-700"
                    >
                      অনুমোদন করুন
                    </button>
                    <button
                      name="decision"
                      value="reject"
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs text-white hover:bg-red-700"
                    >
                      বাতিল করুন
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
  }
      
