"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { topupSchema } from "@/lib/validators";
import Button from "./Button";

const METHODS = [
  { key: "bkash", label: "বিকাশ", number: process.env.NEXT_PUBLIC_BKASH_NUMBER },
  { key: "nagad", label: "নগদ", number: process.env.NEXT_PUBLIC_NAGAD_NUMBER },
  { key: "rocket", label: "রকেট", number: process.env.NEXT_PUBLIC_ROCKET_NUMBER },
] as const;

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

function errorText(message: string) {
  if (message.includes("LOGIN_REQUIRED")) return "আগে লগইন করুন।";
  if (message.includes("PHONE_NOT_VERIFIED")) return "টপআপ এখন চালু নেই। সাপোর্টে যোগাযোগ করুন।";
  if (message.includes("INVALID_AMOUNT")) return "পরিমাণ ১০ থেকে ৫০,০০০ টাকার মধ্যে হতে হবে।";
  if (message.includes("INVALID_PHONE")) return "যে নম্বর থেকে টাকা পাঠিয়েছেন সেটা সঠিক নয়।";
  if (message.includes("INVALID_TRX_ID")) return "TrxID সঠিক নয়।";
  if (message.includes("TOO_MANY_PENDING")) return "আপনার ৩টা অনুরোধ এখনো অপেক্ষমাণ। অনুমোদনের পর আবার দিন।";
  if (message.includes("duplicate") || message.includes("unique")) return "এই TrxID দিয়ে আগেই অনুরোধ করা হয়েছে।";
  return "অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।";
}

export default function TopupForm() {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("bkash");
  const [amount, setAmount] = useState("");
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selected = METHODS.find((m) => m.key === method)!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(false);

    const parsed = topupSchema.safeParse({
      amount: Number(amount),
      method,
      sender_number: sender,
      trx_id: trx,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।");
      return;
    }

    setLoading(true);
    try {
      const { error: rpcError } = await createClient().rpc("request_topup", {
        p_amount: parsed.data.amount,
        p_method: parsed.data.method,
        p_sender_number: parsed.data.sender_number,
        p_trx_id: parsed.data.trx_id,
      });
      if (rpcError) {
        setError(errorText(rpcError.message));
        return;
      }
      setSuccess(true);
      setAmount("");
      setSender("");
      setTrx("");
      router.refresh();
    } catch {
      setError("ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <span className="mb-1 block text-sm font-medium">পেমেন্ট মাধ্যম</span>
        <div className="flex gap-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMethod(m.key)}
              className={`rounded-lg border px-4 py-2 text-sm ${method === m.key ? "bg-neutral-900 text-white" : "border-neutral-300"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        {selected.number ? (
          <>
            আপনার {selected.label} থেকে <span className="font-bold">সেন্ড মানি</span> করুন এই নম্বরে:{" "}
            <span className="font-mono font-bold">{selected.number}</span>
          </>
        ) : (
          <>এই মাধ্যমের নম্বর এখনো দেওয়া হয়নি। অন্য মাধ্যম বেছে নিন বা সাপোর্টে যোগাযোগ করুন।</>
        )}
        <p className="mt-1 text-xs text-neutral-600">
          টাকা পাঠানোর পর নিচের তথ্য দিন। আমরা মিলিয়ে দেখে কয়েন যোগ করে দেব (১ টাকা = ১ কয়েন)।
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">কত টাকা পাঠিয়েছেন</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">যে নম্বর থেকে পাঠিয়েছেন</span>
        <input
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          type="tel"
          inputMode="numeric"
          placeholder="01XXXXXXXXX"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">TrxID</span>
        <input
          value={trx}
          onChange={(e) => setTrx(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          className={`${inputClass} font-mono`}
        />
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          অনুরোধ পাঠানো হয়েছে। যাচাই শেষে কয়েন যোগ হবে।
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        অনুরোধ পাঠান
      </Button>
    </form>
  );
   }
    
