"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "./Button";

/** Customers can change their name only. The phone number is changed through verification (server side). */
export default function ProfileForm({ userId, fullName }: { userId: string; fullName: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setMessage({ type: "error", text: "নাম কমপক্ষে ২ অক্ষরের হতে হবে।" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await createClient().from("profiles").update({ full_name: trimmed }).eq("id", userId);
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" });
      return;
    }
    setMessage({ type: "ok", text: "নাম সংরক্ষণ হয়েছে।" });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">নাম</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </label>
      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      )}
      <Button type="submit" size="sm" loading={loading}>
        সংরক্ষণ করুন
      </Button>
    </form>
  );
  }
                
