import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import Balance from "@/components/Balance";
import TopupForm from "@/components/TopupForm";
import RedeemForm from "@/components/RedeemForm";
import { buttonClasses } from "@/components/Button";

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

  const [{ data: wallet }, { data: profile }, { data: ledger }, { data: topups }] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
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
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">আমার ওয়ালেট</h1>
        <Link href="/account" className={buttonClasses("ghost", "sm", "min-h-11")}>
          ← অ্যাকাউন্ট
        </Link>
      </div>

      <section className="card p-6 text-center">
        <div className="mb-3 text-sm text-neutral-600">কয়েন ব্যালান্স</div>
        <Balance amount={wallet?.balance ?? 0} size="lg" name={profile?.full_name} />
        <div className="mt-3 text-xs text-neutral-600">১ কয়েন = ১ টাকা</div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">টাকা পাঠিয়ে কয়েন নিন</h2>
        <TopupForm />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">রিডিম কোড</h2>
        <RedeemForm />
      </section>

      {(topups ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">আমার টপআপ অনুরোধ</h2>
          <ul className="card-sm divide-y divide-neutral-900/10 text-sm">
            {(topups ?? []).map((t) => {
              const s = STATUS_LABEL[t.status] ?? { text: t.status, cls: "" };
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-semibold">
                      {t.amount} টাকা · {METHOD[t.method] ?? t.method}
                    </div>
                    <div className="text-xs text-neutral-600">{formatDate(t.created_at)}</div>
                    {t.admin_note && <div className="text-xs text-neutral-600">নোট: {t.admin_note}</div>}
                  </div>
                  <span className={`text-xs font-semibold ${s.cls}`}>{s.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-bold">লেনদেনের ইতিহাস</h2>
        {(ledger ?? []).length === 0 ? (
          <p className="text-sm text-neutral-600">এখনো কোনো লেনদেন নেই।</p>
        ) : (
          <ul className="card-sm divide-y divide-neutral-900/10 text-sm">
            {(ledger ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold">{TYPE_LABEL[l.type] ?? l.type}</div>
                  <div className="text-xs text-neutral-600">{formatDate(l.created_at)}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Balance amount={l.amount} size="sm" sign />
                  <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                    ব্যালান্স: <Balance amount={l.balance_after} size="sm" className="text-neutral-600" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
