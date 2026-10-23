import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in Vercel > Settings > Environment Variables)"
    );
  }
  return { url, key };
}

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Acts as the logged-in user (reads the session from cookies), so RLS applies.
 * Always check the user with  supabase.auth.getUser()  (never getSession()).
 */
export async function createClient() {
  const { url, key } = publicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component (cookies are read-only there).
          // Safe to ignore: middleware.ts refreshes the session cookies.
        }
      },
    },
  });
}

/**
 * ADMIN client with the service_role / secret key. It BYPASSES RLS.
 * Use only inside API routes / server actions, and only AFTER you have checked who the caller is.
 * Needed for: marking a phone as verified after OTP, other server-only jobs.
 * Never import this file from a "use client" component.
 */
export function createAdminClient() {
  const { url } = publicEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only env variable in Vercel)");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
