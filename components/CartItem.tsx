"use client";

import { useSyncExternalStore } from "react";

/**
 * Guest-friendly cart stored in the browser (localStorage).
 * The price here is for DISPLAY only. The database recalculates every price in place_order().
 * Use only from client components ("use client").
 */

export type CartItem = {
  variantId: number;
  productId: number;
  slug: string;
  name: string;
  size: string;
  color: string;
  image: string | null;
  price: number; // display only
  quantity: number;
};

const KEY = "taz_cart_v1";
const EVENT = "taz-cart-change";
const MAX_QTY = 20;

const EMPTY: CartItem[] = [];
let cachedRaw: string | null = null;
let cachedValue: CartItem[] = EMPTY;

function isValid(i: unknown): i is CartItem {
  const x = i as CartItem;
  return (
    !!x &&
    typeof x.variantId === "number" &&
    typeof x.quantity === "number" &&
    x.quantity > 0 &&
    typeof x.price === "number" &&
    typeof x.name === "string"
  );
}

function read(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedValue; // same reference until something changes
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed) ? parsed.filter(isValid) : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function write(items: CartItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage blocked (private mode etc.): cart just will not persist
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback); // other tabs
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** React hook: current cart, item count and subtotal (display only). */
export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { items, count, subtotal };
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1) {
  const items = [...read()];
  const existing = items.find((i) => i.variantId === item.variantId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY);
  } else {
    items.push({ ...item, quantity: Math.min(quantity, MAX_QTY) });
  }
  write(items);
}

export function updateQuantity(variantId: number, quantity: number) {
  if (quantity <= 0) return removeFromCart(variantId);
  write(
    read().map((i) =>
      i.variantId === variantId ? { ...i, quantity: Math.min(quantity, MAX_QTY) } : i
    )
  );
}

export function removeFromCart(variantId: number) {
  write(read().filter((i) => i.variantId !== variantId));
}

export function clearCart() {
  saveCoupon(null);
  write([]);
}

/** Shape expected by place_order(): prices are NOT sent. */
export function toOrderItems(items: CartItem[]) {
  return items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
}

/* ---- coupon code chosen in the cart (re-checked by the server at checkout) ---- */
const COUPON_KEY = "taz_coupon_v1";

export function saveCoupon(code: string | null) {
  try {
    if (code) window.localStorage.setItem(COUPON_KEY, code);
    else window.localStorage.removeItem(COUPON_KEY);
  } catch {
    // ignore
  }
}

export function loadCoupon(): string | null {
  try {
    return window.localStorage.getItem(COUPON_KEY);
  } catch {
    return null;
  }
                                             }
      
