"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authErrorMessage, safeNextPath } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import Button from "@/components/Button";

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE;

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
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

    const parsed = loginSchema.safeParse({ phone, pin });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? authErrorMessage(data?.error ?? "x"));
        setPin("");
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
          <span className="mb-1 block text-sm font-medium">ফোন নম্বর</span>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">৪ সংখ্যার পিন</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
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

      <p className="mt-4 text-center text-sm text-neutral-600">
        পিন ভুলে গেছেন বা অ্যাকাউন্ট লক হয়েছে? সাপোর্টের সাথে যোগাযোগ করুন
        {SUPPORT_PHONE ? (
          <>
            : <a href={`tel:${SUPPORT_PHONE}`} className="font-medium underline">{SUPPORT_PHONE}</a>
          </>
        ) : (
          "।"
        )}
      </p>

      <p className="mt-6 text-center text-sm text-neutral-600">
        অ্যাকাউন্ট নেই?{" "}
        <Link href={next !== "/account" ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium underline">
          রেজিস্টার করুন
        </Link>
      </p>
    </div>
  );
            }
      
