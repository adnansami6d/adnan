import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (use inside "use client" components).
// Uses only the public URL + publishable (anon) key. Access is limited by RLS in the database.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in Vercel > Settings > Environment Variables)"
    );
  }

  return createBrowserClient(url, key);
                             }
