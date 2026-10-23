"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className="rounded-lg px-3 py-2 hover:bg-neutral-100">
      লগআউট
    </button>
  );
}
