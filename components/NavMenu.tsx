"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import { buttonClasses } from "./Button";

/**
 * The three-line (☰) button and its dropdown menu, for phones and small screens only (milestone M3).
 * It must sit inside a `relative` parent (the header card), the menu opens right below that card.
 * Closes by itself when a link is tapped, when the page changes, on Escape, or when the dark area outside is tapped.
 */
const itemClass =
  "block rounded-2xl px-4 py-3 text-base font-medium text-neutral-800 active:bg-black/10 hover:bg-black/5";

export default function NavMenu({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "মেনু বন্ধ করুন" : "মেনু খুলুন"}
        className={buttonClasses("outline", "sm", "h-10 w-10 p-0")}
      >
        <span className="relative block h-3.5 w-5" aria-hidden="true">
          <span
            className={`absolute left-0 h-0.5 w-5 rounded bg-neutral-900 transition-all duration-200 ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 h-0.5 w-5 rounded bg-neutral-900 transition-all duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 h-0.5 w-5 rounded bg-neutral-900 transition-all duration-200 ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {open && (
        <>
          {/* tapping outside closes the menu */}
          <button
            type="button"
            aria-label="মেনু বন্ধ করুন"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-neutral-900/20"
          />
          <div id="mobile-menu" className="card absolute left-0 right-0 top-full z-50 mt-2 p-3">
            <form action="/products" method="get" onSubmit={close} className="mb-2">
              <input type="search" name="q" placeholder="প্রোডাক্ট খুঁজুন..." className="input-pill" />
            </form>

            <nav className="flex flex-col">
              <Link href="/products" onClick={close} className={itemClass}>
                প্রোডাক্ট
              </Link>
              {loggedIn ? (
                <>
                  <Link href="/account" onClick={close} className={itemClass}>
                    অ্যাকাউন্ট
                  </Link>
                  <Link href="/account/orders" onClick={close} className={itemClass}>
                    আমার অর্ডার
                  </Link>
                  <Link href="/wallet" onClick={close} className={itemClass}>
                    ওয়ালেট
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={close} className={itemClass}>
                      অ্যাডমিন
                    </Link>
                  )}
                  <div className="mt-2 border-t border-black/5 pt-3">
                    <LogoutButton className="w-full" />
                  </div>
                </>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-black/5 pt-3">
                  <Link href="/login" onClick={close} className={buttonClasses("primary", "md")}>
                    লগইন
                  </Link>
                  <Link href="/register" onClick={close} className={buttonClasses("outline", "md")}>
                    রেজিস্টার
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
