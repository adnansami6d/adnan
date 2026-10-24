"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authErrorMessage, safeNextPath } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import Button from "@/components/Button";

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/account");

  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const parsed = registerSchema.safeParse({ full_name: fullName, phone, pin });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।");
      return;
    }
    if (pin !== pin2) {
      setError("দুইবারের পিন মিলছে না।");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, phone, pin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? authErrorMessage(data?.error ?? "x"));
        return;
      }
      if (data.loggedIn) {
        router.push(next);
        router.refresh();
      } else {
        router.push("/login");
      }
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">রেজিস্টার</h1>
      <p className="mt-1 text-sm text-neutral-600">ফোন নম্বর ও ৪ সংখ্যার পিন দিয়ে অ্যাকাউন্ট খুলুন।</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">আপনার নাম</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className={inputClass}
          />
        </label>
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
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">পিন আবার লিখুন</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>

        <p className="text-xs text-neutral-500">
          পিন মনে রাখুন। ভুলে গেলে সাপোর্টের সাথে যোগাযোগ করতে হবে।
        </p>

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
        <Link href={next !== "/account" ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium underline">
          লগইন করুন
        </Link>
      </p>
    </div>
  );
         }
  
