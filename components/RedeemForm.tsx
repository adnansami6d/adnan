"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { redeemSchema } from "@/lib/validators";
import Button from "./Button";

const MESSAGES: Record<string, string> = {
  INVALID_CODE: "কোডটি সঠিক নয়। আবার দেখে লিখুন।",
  ALREADY_USED: "এই কোডটি আগেই ব্যবহার করা হয়েছে।",
  CODE_EXPIRED: "এই কোডের মেয়াদ শেষ হয়ে গেছে।",
  TOO_MANY_ATTEMPTS: "অনেকবার ভুল কোড দেওয়া হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
};

/** Auto-format while typing: ABCD-1234-EF56-7890 */
function formatCode(raw: string) {
  const clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 16);
  return clean.match(/.{1,4}/g)?.join("-") ?? "";
}

export default function RedeemForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(null);

    const parsed = redeemSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "কোডটি সঠিক নয়।");
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await createClient().rpc("redeem_code", { p_code: code });
      if (rpcError) {
        setError("কোড ব্যবহার করা যায়নি। আবার চেষ্টা করুন।");
        return;
      }
      const result = data as { ok: boolean; amount?: number; error?: string };
      if (!result?.ok) {
        setError(MESSAGES[result?.error ?? ""] ?? "কোড ব্যবহার করা যায়নি।");
        return;
      }
      setSuccess(`${result.amount} কয়েন আপনার ওয়ালেটে যোগ হয়েছে।`);
      setCode("");
      router.refresh();
    } catch {
      setError("ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">রিডিম কোড</span>
        <input
          value={code}
          onChange={(e) => setCode(formatCode(e.target.value))}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-neutral-900"
        />
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}

      <Button type="submit" loading={loading} className="w-full">
        কোড ব্যবহার করুন
      </Button>
    </form>
  );
      }
        
