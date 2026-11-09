import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CartLink from "./CartLink";
import LogoutButton from "./LogoutButton";
import NavMenu from "./NavMenu";
import Balance from "./Balance";
import Logo from "./Logo";

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

// plain text links: no shadow, no border (only real buttons look raised)
const linkClass = "rounded-xl px-3 py-2 text-neutral-700 hover:bg-black/5 hover:text-neutral-900";

/**
 * Header (milestone M3). Phone: ONE line = [☰] Taz Fashion ... [cart] [coins]; everything else is inside the ☰ menu.
 * Desktop (md and up): logo, search and links are shown directly.
 */
export default async function Navbar() {
  const { loggedIn, isAdmin, coins } = await getSessionInfo();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div className="card-sm relative mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        <NavMenu loggedIn={loggedIn} isAdmin={isAdmin} />

        <Logo />

        {/* search: only on wide screens (on phones it is inside the ☰ menu) */}
        <form action="/products" method="get" className="ml-4 hidden max-w-md flex-1 md:block">
          <input type="search" name="q" placeholder="প্রোডাক্ট খুঁজুন..." className="input-pill py-2 text-sm" />
        </form>

        <nav className="ml-auto hidden items-center text-sm md:flex">
          <Link href="/products" className={linkClass}>
            প্রোডাক্ট
          </Link>
          {loggedIn ? (
            <>
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

        {/* always visible: cart and coins */}
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <CartLink />
          {loggedIn && (
            <Link href="/wallet" className="btn btn-secondary btn-sm" aria-label="আমার ওয়ালেট">
              <Balance amount={coins} size="sm" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
