import "server-only";
import { createHmac } from "node:crypto";

/**
 * Phone + 4-digit PIN login helpers. SERVER ONLY.
 *
 * Supabase needs an email and a password of at least 6 characters, so:
 *  - the phone number becomes a hidden email   (01712345678@tazfashion.local)
 *  - the 4-digit PIN becomes a long secret password (HMAC of phone + PIN with PIN_SECRET)
 * The customer only ever sees and types the phone number and the 4-digit PIN.
 */

const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "tazfashion.local";

export function phoneToEmail(phone: string): string {
  return `${phone}@${EMAIL_DOMAIN}`;
}

export function pinToPassword(phone: string, pin: string): string {
  const secret = process.env.PIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PIN_SECRET is missing or too short (use at least 32 random characters, set it in Vercel)");
  }
  return createHmac("sha256", secret).update(`${phone}:${pin}`).digest("hex");
                              }
