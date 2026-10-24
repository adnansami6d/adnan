import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "অ্যাডমিন প্যানেল" };

const MENU = [
  { href: "/admin", label: "ড্যাশবোর্ড" },
  { href: "/admin/orders", label: "অর্ডার" },
  { href: "/admin/products", label: "প্রোডাক্ট" },
  { href: "/admin/coupons", label: "কুপন" },
  { href: "/admin/users", label: "কাস্টমার" },
  { href: "/admin/topups", label: "টপআপ" },
  { href: "/admin/redeem-codes", label: "রিডিম কোড" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // middleware already blocks non-admins; this is a second check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (user.app_metadata?.role !== "admin") redirect("/");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">অ্যাডমিন প্যানেল</h1>
        <Link href="/" className="text-sm underline">
          সাইটে ফিরুন
        </Link>
      </div>

      <nav className="mb-6 flex gap-2 overflow-x-auto border-b border-neutral-200 pb-3">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
   }
          
