import Link from "next/link";

type LogoProps = {
  /** sm = header, lg = footer */
  size?: "sm" | "lg";
  /** set to null to render the logo without a link */
  href?: string | null;
};

const GOLD = "#B8893B";

/**
 * Taz Fashion logo: italic serif "Taz" + small gold spaced "FASHION".
 * Fonts (--font-logo, --font-logo-sans) are loaded in app/layout.tsx.
 */
export default function Logo({ size = "sm", href = "/" }: LogoProps) {
  const big = size === "lg";

  const mark = (
    <span className={`inline-flex items-baseline whitespace-nowrap ${big ? "gap-3" : "gap-2"}`}>
      <span
        className={`italic leading-none text-neutral-900 ${big ? "text-5xl" : "text-[28px]"}`}
        style={{ fontFamily: "var(--font-logo), Georgia, serif" }}
      >
        Taz
      </span>
      <span
        className={`uppercase ${big ? "text-xs tracking-[0.4em]" : "text-[9px] tracking-[0.35em]"}`}
        style={{ fontFamily: "var(--font-logo-sans), ui-sans-serif, sans-serif", color: GOLD }}
      >
        Fashion
      </span>
    </span>
  );

  if (href === null) return <span aria-label="Taz Fashion">{mark}</span>;

  return (
    <Link href={href} aria-label="Taz Fashion - হোমপেজ" className="inline-block">
      {mark}
    </Link>
  );
}
