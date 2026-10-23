"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, safeNextPath } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import Button from "@/components/Button";

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/account");

  // /login?next=/checkout  ->  go back there after login
  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword(parsed.data);
      if (authError) {
        setError(authErrorMessage(authError.message));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">লগইন</h1>
      <p className="mt-1 text-sm text-neutral-600">অর্ডার ট্র্যাক, কয়েন ও ওয়ালেট ব্যবহারের জন্য লগইন করুন।</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">ইমেইল</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">পাসওয়ার্ড</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          লগইন
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        অ্যাকাউন্ট নেই?{" "}
        <Link href={next !== "/account" ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium underline">
          রেজিস্টার করুন
        </Link>
      </p>
    </div>
  );
}
  
