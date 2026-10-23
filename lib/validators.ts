import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Phone: same rule as normalize_bd_phone() in the database            */
/* +8801712345678 / 8801712345678 / 01712-345678  ->  01712345678      */
/* ------------------------------------------------------------------ */
export function normalizeBdPhone(input: string): string | null {
  const digits = (input ?? "").replace(/[^0-9+]/g, "").replace(/^\+?88/, "");
  return /^01[3-9][0-9]{8}$/.test(digits) ? digits : null;
}

const bdPhone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const phone = normalizeBdPhone(value);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "সঠিক মোবাইল নম্বর দিন (যেমন 01712345678)" });
      return z.NEVER;
    }
    return phone;
  });

/* ------------------------------------------------------------------ */
/* Districts (dropdown). "Dhaka" must stay exactly "Dhaka" because     */
/* place_order() charges the Dhaka delivery fee only for that value.   */
/* ------------------------------------------------------------------ */
export const BD_DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura", "Brahmanbaria",
  "Chandpur", "Chapainawabganj", "Chattogram", "Chuadanga", "Cumilla", "Cox's Bazar",
  "Dhaka", "Dinajpur", "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj",
  "Habiganj", "Jamalpur", "Jashore", "Jhalokathi", "Jhenaidah", "Joypurhat",
  "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram", "Kushtia", "Lakshmipur",
  "Lalmonirhat", "Madaripur", "Magura", "Manikganj", "Meherpur", "Moulvibazar",
  "Munshiganj", "Mymensingh", "Naogaon", "Narail", "Narayanganj", "Narsingdi",
  "Natore", "Netrokona", "Nilphamari", "Noakhali", "Pabna", "Panchagarh",
  "Patuakhali", "Pirojpur", "Rajbari", "Rajshahi", "Rangamati", "Rangpur",
  "Satkhira", "Shariatpur", "Sherpur", "Sirajganj", "Sunamganj", "Sylhet",
  "Tangail", "Thakurgaon",
] as const;

/* ------------------------------------------------------------------ */
/* Order (matches the arguments of place_order())                      */
/* Prices are NOT sent: the database calculates them.                  */
/* ------------------------------------------------------------------ */
export const cartItemSchema = z.object({
  variant_id: z.number().int().positive(),
  quantity: z.number().int().min(1, "কমপক্ষে ১টি").max(20, "একবারে সর্বোচ্চ ২০টি"),
});

export const placeOrderSchema = z.object({
  name: z.string().trim().min(2, "নাম লিখুন").max(100),
  phone: bdPhone,
  address: z.string().trim().min(5, "পুরো ঠিকানা লিখুন").max(300),
  district: z.enum(BD_DISTRICTS, { errorMap: () => ({ message: "জেলা বাছাই করুন" }) }),
  area: z.string().trim().max(100).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  items: z.array(cartItemSchema).min(1, "কার্ট খালি").max(50),
  coupon_code: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  coin_use: z.number().int().min(0).default(0),
});

/* ------------------------------------------------------------------ */
/* Wallet                                                               */
/* ------------------------------------------------------------------ */
export const PAYMENT_METHODS = ["bkash", "nagad", "rocket"] as const;

export const topupSchema = z.object({
  amount: z.number().int().min(10, "সর্বনিম্ন ১০ টাকা").max(50000, "সর্বোচ্চ ৫০,০০০ টাকা"),
  method: z.enum(PAYMENT_METHODS),
  sender_number: bdPhone,
  trx_id: z
    .string()
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{6,20}$/, "TrxID সঠিক নয়")),
});

export const redeemSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
    .pipe(z.string().length(16, "কোডটি ১৬ অক্ষরের হতে হবে")),
});

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */
export const registerSchema = z.object({
  full_name: z.string().trim().min(2, "নাম লিখুন").max(100),
  phone: bdPhone,
  email: z.string().trim().toLowerCase().email("সঠিক ইমেইল দিন"),
  password: z.string().min(8, "পাসওয়ার্ড কমপক্ষে ৮ অক্ষর").max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("সঠিক ইমেইল দিন"),
  password: z.string().min(1, "পাসওয়ার্ড দিন"),
});

export const otpCodeSchema = z.object({
  code: z.string().trim().regex(/^[0-9]{6}$/, "৬ digit এর কোড দিন"),
});

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type TopupInput = z.infer<typeof topupSchema>;
export type RedeemInput = z.infer<typeof redeemSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
