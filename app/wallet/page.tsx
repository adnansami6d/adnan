import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import TopupForm from "@/components/TopupForm";
import RedeemForm from "@/components/RedeemForm";

export const metadata: Metadata = { title: "আমার ওয়ালেট" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  topup: "টপআপ",
  spend: "অর্ডারে খরচ",
  refund: "ফেরত",
  redeem: "রিডিম কোড",
  admin_adjust: "অ্যাডমিন সংশোধন",
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "অপেক্ষমাণ", cls: "text-amber-700" },
  approved: { text: "অনুমোদিত", cls: "text-green-700" },
  rejected: { text: "বাতিল", cls: "text-red-700" },
};

const METHOD: Record<string, string> = { bkash: "বিকাশ", nagad: "নগদ", rocket: "রকেট" };

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/wallet");

  const [{ data: wallet }, { data: ledger }, { data: topups }] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("wallet_ledger")
      .select("id, amount, balance_after, type, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("wallet_topups")
      .select("id, amount, method, status, admin_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">আমার ওয়ালেট</h1>
        <Link href="/account" className="text-sm underline">
          ← অ্যাকাউন্ট
        </Link>
      </div>

      <section className="rounded-lg border border-neutral-200 p-4 text-center">
        <div className="text-sm text-neutral-600">কয়েন ব্যালান্স</div>
        <div className="mt-1 text-3xl font-bold">{(wallet?.balance ?? 0).toLocaleString("en-US")}</div>
        <div className="text-xs text-neutral-500">১ কয়েন = ১ টাকা</div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 font-semibold">টাকা পাঠিয়ে কয়েন নিন</h2>
        <TopupForm />
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 font-semibold">রিডিম কোড</h2>
        <RedeemForm />
      </section>

      {(topups ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">আমার টপআপ অনুরোধ</h2>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
            {(topups ?? []).map((t) => {
              const s = STATUS_LABEL[t.status] ?? { text: t.status, cls: "" };
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="font-medium">
                      {t.amount} টাকা · {METHOD[t.method] ?? t.method}
                    </div>
                    <div className="text-xs text-neutral-500">{formatDate(t.created_at)}</div>
                    {t.admin_note && <div className="text-xs text-neutral-600">নোট: {t.admin_note}</div>}
                  </div>
                  <span className={`text-xs font-medium ${s.cls}`}>{s.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">লেনদেনের ইতিহাস</h2>
        {(ledger ?? []).length === 0 ? (
          <p className="text-sm text-neutral-600">এখনো কোনো লেনদেন নেই।</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
            {(ledger ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="font-medium">{TYPE_LABEL[l.type] ?? l.type}</div>
                  <div className="text-xs text-neutral-500">{formatDate(l.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${l.amount > 0 ? "text-green-700" : "text-red-700"}`}>
                    {l.amount > 0 ? "+" : ""}
                    {l.amount}
                  </div>
                  <div className="text-xs text-neutral-500">ব্যালান্স: {l.balance_after}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
