import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { taka } from "@/lib/format";
import ProfileForm from "@/components/ProfileForm";
import LogoutButton from "@/components/LogoutButton";
import { buttonClasses } from "@/components/Button";

export const metadata: Metadata = { title: "আমার অ্যাকাউন্ট" };

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const isAdmin = user.app_metadata?.role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">আমার অ্যাকাউন্ট</h1>
        <LogoutButton />
      </div>

      <section className="rounded-lg border border-neutral-200 p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">ফোন নম্বর</dt>
            <dd>{profile?.phone ?? "দেওয়া হয়নি"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">কয়েন ব্যালান্স</dt>
            <dd className="font-semibold">{taka(wallet?.balance ?? 0).replace("৳", "")} কয়েন</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 font-semibold">প্রোফাইল</h2>
        <ProfileForm userId={user.id} fullName={profile?.full_name ?? ""} />
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/account/orders" className={buttonClasses("outline")}>
          আমার অর্ডার
        </Link>
        <Link href="/wallet" className={buttonClasses("outline")}>
          ওয়ালেট
        </Link>
        {isAdmin && (
          <Link href="/admin" className={buttonClasses("primary")}>
            অ্যাডমিন প্যানেল
          </Link>
        )}
      </div>
    </div>
  );
      }
            
