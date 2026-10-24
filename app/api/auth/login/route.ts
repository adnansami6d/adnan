import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { phoneToEmail, pinToPassword } from "@/lib/auth-server";
import { loginSchema } from "@/lib/validators";

/**
 * POST /api/auth/login   body: { phone, pin }
 *
 * Rules (the counting itself lives in the database function auth_begin_attempt, see 006_phone_login.sql):
 *   wrong PIN 1-2  -> try again
 *   wrong PIN 3    -> wait 1 hour
 *   wrong PIN 5    -> account locked, support must unlock it
 */

type Begin = {
  status: "not_found" | "locked" | "wait" | "ok";
  user_id?: string;
  wait_minutes?: number;
  attempt?: number;
  if_wrong?: "retry" | "wait" | "locked";
};

function fail(error: string, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, message, ...extra }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_JSON", "রিকোয়েস্ট সঠিক নয়।", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "তথ্য সঠিক নয়।", 400);
  }
  const { phone, pin } = parsed.data;

  try {
    const admin = createAdminClient();

    // 1) count this attempt first (so parallel guesses cannot skip the limit)
    const { data, error: rpcError } = await admin.rpc("auth_begin_attempt", { p_phone: phone });
    if (rpcError || !data) {
      console.error("login: auth_begin_attempt failed:", rpcError?.message);
      return fail("SERVER_ERROR", "লগইন করা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
    }
    const begin = data as Begin;

    if (begin.status === "not_found") {
      // same message as a wrong PIN, so nobody can find out which numbers have accounts
      return fail("INVALID_CREDENTIALS", "ফোন নম্বর বা পিন ভুল।", 401);
    }
    if (begin.status === "locked") {
      return fail("LOCKED", "আপনার অ্যাকাউন্ট লক করা হয়েছে। অনুগ্রহ করে সাপোর্টের সাথে যোগাযোগ করুন।", 423);
    }
    if (begin.status === "wait") {
      return fail(
        "WAIT",
        `অনেকবার ভুল পিন দেওয়া হয়েছে। প্রায় ${begin.wait_minutes ?? 60} মিনিট পরে আবার চেষ্টা করুন।`,
        429,
        { wait_minutes: begin.wait_minutes ?? 60 }
      );
    }

    // 2) check the PIN
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password: pinToPassword(phone, pin),
    });

    if (!signInError) {
      await admin.rpc("auth_reset_attempts", { p_user: begin.user_id });
      return NextResponse.json({ ok: true });
    }

    if (!signInError.message.toLowerCase().includes("invalid login credentials")) {
      console.error("login: sign-in error:", signInError.message);
      return fail("SERVER_ERROR", "লগইন করা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
    }

    // 3) wrong PIN
    const attempt = begin.attempt ?? 1;
    if (begin.if_wrong === "locked") {
      return fail(
        "LOCKED",
        "৫ বার ভুল পিন দেওয়া হয়েছে। আপনার অ্যাকাউন্ট লক হয়েছে। সাপোর্টের সাথে যোগাযোগ করুন।",
        423
      );
    }
    if (begin.if_wrong === "wait") {
      return fail("WAIT", "৩ বার ভুল পিন দেওয়া হয়েছে। ১ ঘণ্টা পরে আবার চেষ্টা করুন।", 429, { wait_minutes: 60 });
    }
    if (attempt >= 4) {
      return fail(
        "INVALID_CREDENTIALS",
        "পিন ভুল। আর ১ বার চেষ্টা করা যাবে, ভুল হলে অ্যাকাউন্ট লক হবে।",
        401,
        { attempts_left: 1 }
      );
    }
    const left = 3 - attempt;
    return fail("INVALID_CREDENTIALS", `ফোন নম্বর বা পিন ভুল। আর ${left} বার চেষ্টা করা যাবে।`, 401, {
      attempts_left: left,
    });
  } catch (e) {
    console.error("POST /api/auth/login crashed:", e);
    return fail("SERVER_ERROR", "লগইন করা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
  }
      }
      
