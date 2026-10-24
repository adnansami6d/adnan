"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { taka, formatDate } from "@/lib/format";

type Row = {
  id: number;
  hint: string;
  amount: number;
  batch: string | null;
  expires_at: string | null;
  is_active: boolean;
  redeemed_at: string | null;
  created_at: string;
};

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

function errorText(message: string) {
  if (message.includes("FORBIDDEN")) return "অনুমতি নেই।";
  if (message.includes("INVALID_COUNT")) return "কোডের সংখ্যা ১ থেকে ৫০০ এর মধ্যে হতে হবে।";
  if (message.includes("INVALID_AMOUNT")) return "কয়েনের পরিমাণ ১ থেকে ১,০০,০০০ এর মধ্যে হতে হবে।";
  if (message.includes("INVALID_EXPIRY")) return "শেষ তারিখ আজকের পরের কোনো দিন হতে হবে।";
  if (message.includes("CODE_NOT_FOUND_OR_USED")) return "কোডটি ব্যবহৃত হয়ে গেছে বা পাওয়া যায়নি।";
  return "কাজটি করা যায়নি। আবার চেষ্টা করুন।";
}

export default function AdminRedeemCodesPage() {
  const [count, setCount] = useState("10");
  const [amount, setAmount] = useState("");
  const [batch, setBatch] = useState("");
  const [expires, setExpires] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data, error: e } = await createClient()
      .from("redeem_codes")
      .select("id, hint, amount, batch, expires_at, is_active, redeemed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (e) setError("তালিকা আনা যায়নি।");
    else setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setCreated(null);
    setCopied(false);

    const n = Number(count);
    const a = Number(amount);
    if (!Number.isInteger(n) || n < 1 || n > 500) return setError(errorText("INVALID_COUNT"));
    if (!Number.isInteger(a) || a < 1 || a > 100000) return setError(errorText("INVALID_AMOUNT"));

    let expiresAt: string | null = null;
    if (expires) {
      const d = new Date(`${expires}T23:59:59+06:00`); // end of that day, Bangladesh time
      if (Number.isNaN(d.getTime())) return setError("তারিখ সঠিক নয়।");
      expiresAt = d.toISOString();
    }

    setLoading(true);
    const { data, error: rpcError } = await createClient().rpc("admin_create_redeem_codes", {
      p_count: n,
      p_amount: a,
      p_expires_at: expiresAt,
      p_batch: batch.trim() || null,
    });
    setLoading(false);

    if (rpcError) return setError(errorText(rpcError.message));
    const list = (data as { code: string }[]).map((c) => c.code);
    setCreated(list);
    load();
  }

  async function copyAll() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.join("\n"));
      setCopied(true);
    } catch {
      setError("কপি করা যায়নি। লেখাগুলো হাতে সিলেক্ট করে কপি করুন।");
    }
  }

  async function toggle(row: Row) {
    setError(null);
    const { error: rpcError } = await createClient().rpc("admin_set_redeem_code_active", {
      p_id: row.id,
      p_active: !row.is_active,
    });
    if (rpcError) setError(errorText(rpcError.message));
    load();
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">রিডিম কোড</h2>

      <form onSubmit={generate} className="max-w-md space-y-3 rounded-lg border border-neutral-200 p-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">কয়টা কোড *</span>
            <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">প্রতিটায় কয়েন *</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">ব্যাচের নাম</span>
            <input value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={50} placeholder="eid-offer" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">শেষ তারিখ</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
          </label>
        </div>
        <button
          disabled={loading}
          className="w-full rounded-lg bg-neutral-900 px-6 py-2.5 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? "অপেক্ষা করুন..." : "কোড তৈরি করুন"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {created && (
        <section className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">
            এই কোডগুলো শুধু এখনই দেখা যাচ্ছে, পরে আর কোনোভাবে দেখা যাবে না। এখনই কপি করে নিরাপদ জায়গায় রাখুন।
          </p>
          <textarea
            readOnly
            value={created.join("\n")}
            rows={Math.min(created.length, 12)}
            className="w-full rounded border border-neutral-300 bg-white p-2 font-mono text-sm"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button onClick={copyAll} className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">
            {copied ? "কপি হয়েছে ✓" : `সব কোড কপি করুন (${created.length})`}
          </button>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-semibold">সাম্প্রতিক কোড</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-600">এখনো কোনো কোড নেই।</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {rows.map((r) => {
              const expired = !r.redeemed_at && r.expires_at && new Date(r.expires_at).getTime() < now;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="font-mono">•••• •••• •••• {r.hint}</div>
                    <div className="text-neutral-600">
                      {taka(r.amount).replace("৳", "")} কয়েন{r.batch ? ` · ${r.batch}` : ""}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatDate(r.created_at)}
                      {r.expires_at ? ` · শেষ: ${formatDate(r.expires_at)}` : ""}
                    </div>
                    <div className="mt-1 text-xs">
                      {r.redeemed_at ? (
                        <span className="text-blue-700">ব্যবহৃত হয়েছে ({formatDate(r.redeemed_at)})</span>
                      ) : expired ? (
                        <span className="text-red-700">মেয়াদ শেষ</span>
                      ) : r.is_active ? (
                        <span className="text-green-700">চালু</span>
                      ) : (
                        <span className="text-neutral-500">বন্ধ</span>
                      )}
                    </div>
                  </div>
                  {!r.redeemed_at && (
                    <button
                      onClick={() => toggle(r)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100"
                    >
                      {r.is_active ? "বন্ধ করুন" : "চালু করুন"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
