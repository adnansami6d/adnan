import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { phoneToEmail, pinToPassword } from "@/lib/auth-server";
import { registerSchema } from "@/lib/validators";

/**
 * POST /api/auth/register   body: { full_name, phone, pin }
 * Creates the account already "confirmed" (no email, no OTP), then logs the customer in.
 */

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_JSON", "রিকোয়েস্ট সঠিক নয়।", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("VALIDATION", issue?.message ?? "তথ্য সঠিক নয়।", 400);
  }
  const { full_name, phone, pin } = parsed.data;

  try {
    const admin = createAdminClient();

    // one account per phone number
    const { data: existing } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (existing) {
      return fail("PHONE_EXISTS", "এই নম্বরে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।", 409);
    }

    const email = phoneToEmail(phone);
    const password = pinToPassword(phone, pin);

    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email
      user_metadata: { full_name, phone }, // the database trigger copies these into the profile
    });

    if (createError) {
      const m = createError.message.toLowerCase();
      if (m.includes("already") || m.includes("database error")) {
        return fail("PHONE_EXISTS", "এই নম্বরে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।", 409);
      }
      console.error("register: createUser failed:", createError.message);
      return fail("SERVER_ERROR", "অ্যাকাউন্ট খোলা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
    }

    // log the new customer in (sets the session cookies)
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      console.error("register: sign-in failed:", signInError.message);
      return NextResponse.json({ ok: true, loggedIn: false }, { status: 201 });
    }

    return NextResponse.json({ ok: true, loggedIn: true }, { status: 201 });
  } catch (e) {
    console.error("POST /api/auth/register crashed:", e);
    return fail("SERVER_ERROR", "অ্যাকাউন্ট খোলা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
  }
}
