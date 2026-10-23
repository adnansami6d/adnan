"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, safeNextPath } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import Button from "@/components/Button";

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checkEmail, setCheckEmail] = useState(false);
  const [next, setNext] = useState("/account");

  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const parsed = registerSchema.safeParse({ full_name: fullName, phone, email, password });
    const errs: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
    }
    if (password !== confirm) errs.confirm = "দুই পাসওয়ার্ড মেলেনি।";
    setFieldErrors(errs);
    if (!parsed.success || Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const { data, error: authError } = await createClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // the database trigger copies these into the profile
          data: { full_name: parsed.data.full_name, phone: parsed.data.phone },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (authError) {
        setError(authErrorMessage(authError.message));
        return;
      }

      // Supabase hides "already registered" by returning a user with no identities
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError(authErrorMessage("already registered"));
        return;
      }

      if (data.session) {
        // email confirmation is switched off: already logged in
        router.push(next);
        router.refresh();
      } else {
        setCheckEmail(true);
      }
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">ইমেইল চেক করুন</h1>
        <p className="mt-3 text-neutral-700">
          আমরা <strong>{email}</strong> ঠিকানায় একটি নিশ্চিতকরণ লিংক পাঠিয়েছি। লিংকে চাপলে অ্যাকাউন্ট চালু হবে, তারপর লগইন করুন।
        </p>
        <p className="mt-2 text-sm text-neutral-500">ইনবক্সে না পেলে স্প্যাম ফোল্ডার দেখুন।</p>
        <Link href="/login" className="mt-6 inline-block font-medium underline">
          লগইন পেজে যান
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">রেজিস্টার</h1>
      <p className="mt-1 text-sm text-neutral-600">অ্যাকাউন্ট খুললে কয়েন, ওয়ালেট ও অর্ডার হিস্ট্রি ব্যবহার করতে পারবেন।</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">আপনার নাম</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={inputClass} />
          {fieldErrors.full_name && <span className="mt-1 block text-sm text-red-600">{fieldErrors.full_name}</span>}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">মোবাইল নম্বর</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            className={inputClass}
          />
          {fieldErrors.phone && <span className="mt-1 block text-sm text-red-600">{fieldErrors.phone}</span>}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">ইমেইল</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
          {fieldErrors.email && <span className="mt-1 block text-sm text-red-600">{fieldErrors.email}</span>}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
          {fieldErrors.password && <span className="mt-1 block text-sm text-red-600">{fieldErrors.password}</span>}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">পাসওয়ার্ড আবার লিখুন</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
          {fieldErrors.confirm && <span className="mt-1 block text-sm text-red-600">{fieldErrors.confirm}</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          অ্যাকাউন্ট খুলুন
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        আগেই অ্যাকাউন্ট আছে?{" "}
        <Link href="/login" className="font-medium underline">
          লগইন করুন
        </Link>
      </p>
    </div>
  );
}
  
