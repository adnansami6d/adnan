"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "./Button";

/** Customer can cancel only while the order is still "pending" (the database enforces this too). */
export default function CancelOrderButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("অর্ডারটি বাতিল করতে চান? স্টক ও কয়েন (যদি ব্যবহার করে থাকেন) ফেরত আসবে।")) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc("cancel_order", { p_order_id: orderId });
    setLoading(false);

    if (rpcError) {
      setError(
        rpcError.message.includes("ORDER_NOT_CANCELLABLE")
          ? "এই অর্ডার এখন আর বাতিল করা যাবে না।"
          : "বাতিল করা যায়নি। আবার চেষ্টা করুন।"
      );
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button variant="danger" size="sm" onClick={cancel} loading={loading}>
        অর্ডার বাতিল করুন
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
        }
        
