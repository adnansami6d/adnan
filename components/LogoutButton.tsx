"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "./Button";

/** Plain text style by default (it is not a main action). Shows a spinner while signing out and cannot be double-tapped. */
export default function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="md" onClick={logout} className={className}>
      লগআউট
    </Button>
  );
}
