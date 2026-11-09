// Small formatting helpers shared by pages and components

export const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;

/** Coin amount as plain digits (no ৳). Always show it next to the <Coin> icon: coins use <Balance>, money uses taka(). */
export const coins = (n: number) => n.toLocaleString("en-US");

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
