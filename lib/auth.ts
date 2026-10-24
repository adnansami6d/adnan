/** Only allow redirects to pages inside this site (stops "?next=https://evil.site" tricks). */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  return fallback;
}

/** Turns auth error codes / messages (phone + PIN login) into Bangla for the visitor. */
export function authErrorMessage(codeOrMessage: string): string {
  const m = codeOrMessage.toLowerCase();

  // codes from /api/auth/login and /api/auth/register
  if (m === "invalid_credentials") return "ফোন নম্বর বা পিন ভুল।";
  if (m === "wait") return "অনেকবার ভুল পিন দেওয়া হয়েছে। ১ ঘণ্টা পরে আবার চেষ্টা করুন।";
  if (m === "locked") return "আপনার অ্যাকাউন্ট লক করা হয়েছে। সাপোর্টের সাথে যোগাযোগ করুন।";
  if (m === "phone_exists") return "এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।";
  if (m === "validation") return "তথ্য সঠিক নয়। ফোন নম্বর ও ৪ সংখ্যার পিন দিন।";

  // fallbacks for raw messages
  if (m.includes("invalid login credentials")) return "ফোন নম্বর বা পিন ভুল।";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।";
  }
  if (m.includes("rate limit") || m.includes("too many")) return "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  if (m.includes("network") || m.includes("fetch")) return "ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।";
  return "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।";
}
