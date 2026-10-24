import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { pinToPassword } from "@/lib/auth-server";
import { loginSchema } from "@/lib/validators";

/**
 * POST /api/admin/reset-pin   body: { phone, pin }   (admin only)
 * Sets a NEW 4-digit PIN for the customer with this phone number and unlocks the account.
 * Use it when a customer forgot the PIN or the account got locked.
 */

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(request: Request) {
  try {
    // 1) only a logged-in admin may use this
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("LOGIN_REQUIRED", "আগে লগইন করুন।", 401);
    if (user.app_metadata?.role !== "admin") return fail("FORBIDDEN", "অনুমতি নেই।", 403);

    // 2) read input (same rules as login: phone + 4-digit PIN)
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

    // 3) find the customer
    const admin = createAdminClient();
    const { data: profile, error: findError } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (findError) {
      console.error("reset-pin: lookup failed:", findError.message);
      return fail("SERVER_ERROR", "পিন বদলানো যায়নি।", 500);
    }
    if (!profile) return fail("NOT_FOUND", "এই নম্বরে কোনো অ্যাকাউন্ট নেই।", 404);

    // 4) set the new PIN and unlock
    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
      password: pinToPassword(phone, pin),
    });
    if (updateError) {
      console.error("reset-pin: update failed:", updateError.message);
      return fail("SERVER_ERROR", "পিন বদলানো যায়নি।", 500);
    }
    await admin.rpc("auth_reset_attempts", { p_user: profile.id });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/admin/reset-pin crashed:", e);
    return fail("SERVER_ERROR", "পিন বদলানো যায়নি।", 500);
  }
        }
    
