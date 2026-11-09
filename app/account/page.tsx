import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Balance from "@/components/Balance";
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
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">আমার অ্যাকাউন্ট</h1>
        <LogoutButton />
      </div>

      <section className="card p-5">
        <dl className="space-y-3 text-[15px]">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-600">ফোন নম্বর</dt>
            <dd className="font-medium">{profile?.phone ?? "দেওয়া হয়নি"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-600">কয়েন ব্যালান্স</dt>
            <dd>
              <Balance amount={wallet?.balance ?? 0} size="md" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="mb-3 text-lg font-bold">প্রোফাইল</h2>
        <ProfileForm userId={user.id} fullName={profile?.full_name ?? ""} />
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href="/account/orders" className={buttonClasses("outline", "lg")}>
          আমার অর্ডার
        </Link>
        <Link href="/wallet" className={buttonClasses("outline", "lg")}>
          ওয়ালেট
        </Link>
        {isAdmin && (
          <Link href="/admin" className={buttonClasses("primary", "lg", "sm:col-span-2")}>
            অ্যাডমিন প্যানেল
          </Link>
        )}
      </div>
    </div>
  );
}
