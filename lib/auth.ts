/** Only allow redirects to pages inside this site (stops "?next=https://evil.site" tricks). */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  return fallback;
}

/** Turns Supabase auth error messages into Bangla for the visitor. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "ইমেইল বা পাসওয়ার্ড ভুল।";
  if (m.includes("email not confirmed")) return "আপনার ইমেইল এখনো নিশ্চিত করা হয়নি। ইমেইলের লিংকে চাপুন।";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।";
  }
  if (m.includes("password") && m.includes("least")) return "পাসওয়ার্ড আরও বড় দিন (কমপক্ষে ৮ অক্ষর)।";
  if (m.includes("rate limit") || m.includes("too many")) return "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  if (m.includes("network") || m.includes("fetch")) return "ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।";
  return "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।";
}
  
