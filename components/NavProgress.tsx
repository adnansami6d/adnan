"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin progress bar at the very top of the page (milestone M1).
 * Starts when a visitor taps an internal link, finishes when the new page has arrived.
 * Safety: it stops by itself after 15 seconds so it can never get stuck.
 * Note: router.push() navigations do not show it (those are not link clicks); buttons show their own spinner.
 */
function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickle = useRef<number | null>(null);
  const safety = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const running = useRef(false);

  const clearTimers = useCallback(() => {
    if (trickle.current) window.clearInterval(trickle.current);
    if (safety.current) window.clearTimeout(safety.current);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    trickle.current = safety.current = hideTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearTimers();
    setWidth(100);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    clearTimers();
    setVisible(true);
    setWidth(8);
    // moves forward quickly at first, then slows down and never reaches 100% on its own
    trickle.current = window.setInterval(() => {
      setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w));
    }, 200);
    safety.current = window.setTimeout(finish, 15000);
  }, [clearTimers, finish]);

  // a link was tapped -> start
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // same page (or only a #hash change): nothing will load
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [start]);

  // new page arrived (path or query changed) -> finish
  useEffect(() => {
    finish();
  }, [routeKey, finish]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] w-full">
      <div
        className="h-full rounded-r-full bg-neutral-900 shadow-[0_0_8px_rgba(17,17,17,0.45)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function NavProgress() {
  // useSearchParams() needs a Suspense boundary in the root layout
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
