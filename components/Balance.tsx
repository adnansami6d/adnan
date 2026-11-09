import Coin from "./Coin";
import { coins, taka } from "@/lib/format";

/**
 * Coin amount with the gold coin icon (milestone M2). Use this EVERYWHERE a coin amount is shown,
 * and use taka() with ৳ for money. Never mix the two.
 *
 *   <Balance amount={1250} />                              small, in a line:  (coin) 1,250
 *   <Balance amount={1250} size="lg" name="রহিম উদ্দিন" />   big wallet card: coin with the name + number + "= ৳1,250"
 *   <Balance amount={-300} sign />                         ledger line: shows + or −, green / red
 */
type Props = {
  amount: number;
  size?: "sm" | "md" | "lg";
  /** account holder's name, shown on the big coin's ribbon (size="lg" only) */
  name?: string | null;
  /** show + / − and colour it green / red (for wallet history) */
  sign?: boolean;
  className?: string;
};

const ICON = { sm: 20, md: 26, lg: 140 } as const;
const TEXT = { sm: "text-sm font-semibold", md: "text-lg font-bold", lg: "text-4xl font-bold" } as const;

export default function Balance({ amount, size = "sm", name, sign = false, className = "" }: Props) {
  const color = sign ? (amount < 0 ? "text-red-600" : "text-green-700") : "";
  const shown = sign ? `${amount < 0 ? "−" : "+"}${coins(Math.abs(amount))}` : coins(amount);

  if (size === "lg") {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <Coin size={ICON.lg} name={name} />
        <div className={`mt-3 ${TEXT.lg} ${color}`}>{shown}</div>
        <div className="mt-1 text-sm text-neutral-500">= {taka(Math.abs(amount))}</div>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${TEXT[size]} ${color} ${className}`}>
      <Coin size={ICON[size]} compact />
      <span>{shown}</span>
    </span>
  );
}
