import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { placeOrderSchema } from "@/lib/validators";

/**
 * POST /api/orders
 * Creates an order through the place_order() database function.
 *  - guests can order (cash on delivery)
 *  - coins need a logged-in user (the session cookie is used, so the database knows who is paying)
 *  - prices are NEVER taken from the request: the database calculates them from the variants
 *
 * Body: { name, phone, address, district, area?, note?, items: [{variant_id, quantity}], coupon_code?, coin_use? }
 * OK:    { ok: true, order: { order_id, order_number, subtotal, delivery_fee, discount, total, coin_used, cod_due } }
 * Error: { ok: false, error: "CODE", message: "বাংলা বার্তা" }
 */

const MESSAGES: Record<string, { status: number; text: string }> = {
  NAME_REQUIRED: { status: 400, text: "নাম লিখুন।" },
  ADDRESS_REQUIRED: { status: 400, text: "ঠিকানা লিখুন।" },
  DISTRICT_REQUIRED: { status: 400, text: "জেলা বাছাই করুন।" },
  INVALID_PHONE: { status: 400, text: "সঠিক মোবাইল নম্বর দিন।" },
  EMPTY_CART: { status: 400, text: "কার্ট খালি।" },
  TOO_MANY_ITEMS: { status: 400, text: "একবারে অনেক বেশি আইটেম।" },
  INVALID_QUANTITY: { status: 400, text: "পরিমাণ ১ থেকে ২০ এর মধ্যে হতে হবে।" },
  INVALID_COIN_AMOUNT: { status: 400, text: "কয়েনের পরিমাণ সঠিক নয়।" },
  LOGIN_REQUIRED_FOR_COINS: { status: 401, text: "কয়েন ব্যবহার করতে লগইন করুন।" },
  COIN_EXCEEDS_TOTAL: { status: 400, text: "কয়েন মোট বিলের চেয়ে বেশি হতে পারবে না।" },
  INSUFFICIENT_COINS: { status: 409, text: "আপনার কয়েন ব্যালান্স যথেষ্ট নয়।" },
  OUT_OF_STOCK: { status: 409, text: "একটি আইটেমের স্টক শেষ বা কম। কার্ট আপডেট করুন।" },
  INVALID_COUPON: { status: 400, text: "কুপন সঠিক নয়।" },
  COUPON_NOT_STARTED: { status: 400, text: "কুপন এখনো চালু হয়নি।" },
  COUPON_EXPIRED: { status: 400, text: "কুপনের মেয়াদ শেষ।" },
  COUPON_LIMIT_REACHED: { status: 400, text: "এই কুপনের ব্যবহারের সীমা শেষ।" },
  COUPON_MIN_ORDER: { status: 400, text: "কুপনের জন্য ন্যূনতম অর্ডারের পরিমাণ পূরণ হয়নি।" },
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

  const parsed = placeOrderSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("VALIDATION", issue?.message ?? "তথ্য সঠিক নয়।", 400, {
      field: issue?.path.join("."),
    });
  }
  const o = parsed.data;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("place_order", {
      p_name: o.name,
      p_phone: o.phone,
      p_address: o.address,
      p_district: o.district,
      p_area: o.area || null,
      p_note: o.note || null,
      p_items: o.items,
      p_coupon_code: o.coupon_code || null,
      p_coin_use: o.coin_use,
    });

    if (error) {
      // database errors look like "OUT_OF_STOCK:12" or "COUPON_MIN_ORDER:500"
      const [code, detail] = error.message.split(":");
      const known = MESSAGES[code];
      if (known) {
        return fail(code, known.text, known.status, detail ? { detail } : undefined);
      }
      console.error("place_order failed:", error.message);
      return fail("SERVER_ERROR", "অর্ডার করা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
    }

    return NextResponse.json({ ok: true, order: data }, { status: 201 });
  } catch (e) {
    console.error("POST /api/orders crashed:", e);
    return fail("SERVER_ERROR", "অর্ডার করা যায়নি। একটু পরে আবার চেষ্টা করুন।", 500);
  }
                             }
