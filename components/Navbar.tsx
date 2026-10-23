import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CartLink from "./CartLink";
import LogoutButton from "./LogoutButton";

type SessionInfo = { loggedIn: boolean; isAdmin: boolean; coins: number };

async function getSessionInfo(): Promise<SessionInfo> {
  const guest: SessionInfo = { loggedIn: false, isAdmin: false, coins: 0 };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return guest;

    const { data } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      loggedIn: true,
      isAdmin: user.app_metadata?.role === "admin",
      coins: data?.balance ?? 0,
    };
  } catch {
    return guest; // never let the header break the whole site
  }
}

const linkClass = "rounded-lg px-3 py-2 hover:bg-neutral-100";

export default async function Navbar() {
  const { loggedIn, isAdmin, coins } = await getSessionInfo();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Taz Fashion
        </Link>

        {/* search: sends the visitor to /products?q=... */}
        <form action="/products" method="get" className="order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1 sm:max-w-md">
          <input
            type="search"
            name="q"
            placeholder="প্রোডাক্ট খুঁজুন..."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </form>

        <nav className="ml-auto flex flex-wrap items-center text-sm">
          <Link href="/products" className={linkClass}>
            প্রোডাক্ট
          </Link>
          <CartLink />
          {loggedIn ? (
            <>
              <Link href="/wallet" className={linkClass}>
                কয়েন: {coins}
              </Link>
              <Link href="/account" className={linkClass}>
                অ্যাকাউন্ট
              </Link>
              {isAdmin && (
                <Link href="/admin" className={linkClass}>
                  অ্যাডমিন
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass}>
                লগইন
              </Link>
              <Link href="/register" className={linkClass}>
                রেজিস্টার
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
      }
    
