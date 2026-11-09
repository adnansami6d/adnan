import { useId } from "react";

/**
 * Taz Fashion gold coin (milestone M2).
 *
 *   <Coin size={96} name="রহিম উদ্দিন" />   medium/large: crown + "TAZ" + the user's name on the ribbon
 *   <Coin size={20} />                       small: simple coin (the detailed one is unreadable below ~56px)
 *
 * - `name`: the account holder's name (profiles.full_name). If empty, the ribbon stays blank.
 * - `compact`: force the simple version (default: automatic for size < 56).
 * Works in server and client components. Gradient ids are unique per coin (useId), so many coins can sit on one page.
 */
type Props = {
  size?: number;
  name?: string | null;
  compact?: boolean;
  className?: string;
};

const BEADS = Array.from({ length: 40 }, (_, i) => {
  const a = (i * 9 * Math.PI) / 180;
  return [50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a)] as const;
});
const TICKS = Array.from({ length: 90 }, (_, i) => {
  const a = (i * 4 * Math.PI) / 180;
  return [50 + 40.6 * Math.cos(a), 50 + 40.6 * Math.sin(a), 50 + 42.4 * Math.cos(a), 50 + 42.4 * Math.sin(a)] as const;
});

/** keep the name inside the ribbon: shorten very long names and shrink the letters a little */
function fitName(raw: string) {
  const clean = raw.trim().replace(/\s+/g, " ");
  const chars = Array.from(clean);
  const text = chars.length > 18 ? chars.slice(0, 17).join("") + "…" : clean;
  const len = Array.from(text).length;
  const fontSize = Math.max(3.4, Math.min(5.8, 40 / (len * 0.62)));
  return { text, fontSize };
}

export default function Coin({ size = 48, name, compact, className }: Props) {
  const p = useId().replace(/:/g, "");
  const simple = compact ?? size < 56;
  const label = name ? fitName(name) : null;

  if (simple) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label="কয়েন">
        <defs>
          <linearGradient id={`${p}g`} x1=".15" y1="0" x2=".85" y2="1">
            <stop offset="0" stopColor="#FFE27A" />
            <stop offset="1" stopColor="#F2A100" />
          </linearGradient>
          <linearGradient id={`${p}gl`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="#C98600" />
        <circle cx="50" cy="50" r="42" fill={`url(#${p}g)`} />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#C98600" strokeWidth="5" />
        <path d="M16 38 A36 36 0 0 1 46 14 Q28 22 20 44 Z" fill={`url(#${p}gl)`} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={name ? `${name}-এর কয়েন` : "কয়েন"}>
      <defs>
        <linearGradient id={`${p}g`} x1=".15" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor="#FFE27A" />
          <stop offset="1" stopColor="#F2A100" />
        </linearGradient>
        <linearGradient id={`${p}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E5A21A" />
          <stop offset="1" stopColor="#C98600" />
        </linearGradient>
        <linearGradient id={`${p}gl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="97" rx="32" ry="2.6" fill="#0f172a" opacity=".16" />
      <circle cx="50" cy="50" r="48.5" fill={`url(#${p}r)`} />
      <circle cx="50" cy="50" r="47" fill={`url(#${p}g)`} />
      <g fill="#C98600">
        {BEADS.map(([x, y], i) => (
          <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r="1.35" />
        ))}
      </g>
      <circle cx="50" cy="50" r="43.4" fill="none" stroke="#C98600" strokeWidth="1.1" />
      <g stroke="#C98600" strokeWidth=".7" opacity=".8">
        {TICKS.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)} />
        ))}
      </g>
      <circle cx="50" cy="50" r="39.2" fill="none" stroke="#C98600" strokeWidth="1.1" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#FFF3B0" strokeWidth=".6" opacity=".8" />
      <g transform="translate(8 3.5) scale(.72)"><g fill="none" stroke="#8A5A00" strokeWidth="1.6" strokeLinecap="round">
<path d="M30 33 C20 31 15 40 19 47 C22 52 29 51 29 46 C29 42 24 42 24 45"/>
<path d="M32 36 C27 36 24 40 26 43"/>
<path d="M29 56 C23 56 20 60 22 63"/>
</g>
<g fill="#8A5A00"><circle cx="24" cy="45" r="1.5"/><circle cx="22" cy="63" r="1.3"/>
<path d="M34 30 q4 -3 8 -1 q-3 4 -8 1z"/></g></g>
<g fill="#8A5A00"><path d="M20 56 q-6 -1 -7 -6 q6 0 7 6z"/><path d="M26 59.5 q-6 1 -8 -3 q6 -2 8 3z"/></g><g transform="translate(100 0) scale(-1 1)"><g transform="translate(8 3.5) scale(.72)"><g fill="none" stroke="#8A5A00" strokeWidth="1.6" strokeLinecap="round">
<path d="M30 33 C20 31 15 40 19 47 C22 52 29 51 29 46 C29 42 24 42 24 45"/>
<path d="M32 36 C27 36 24 40 26 43"/>
<path d="M29 56 C23 56 20 60 22 63"/>
</g>
<g fill="#8A5A00"><circle cx="24" cy="45" r="1.5"/><circle cx="22" cy="63" r="1.3"/>
<path d="M34 30 q4 -3 8 -1 q-3 4 -8 1z"/></g></g>
<g fill="#8A5A00"><path d="M20 56 q-6 -1 -7 -6 q6 0 7 6z"/><path d="M26 59.5 q-6 1 -8 -3 q6 -2 8 3z"/></g></g>
      <g transform="translate(0 3.2) translate(50 30) scale(.84) translate(-50 -30)">
<path d="M36 28 L38 17 L43 23 L50 14 L57 23 L62 17 L64 28 Z" fill="#8A5A00"/>
<path d="M37.5 28 h25 v3.6 h-25z" fill="#8A5A00"/>
<path d="M39 25.5 L40.2 20.5 L44 25 L50 17.5 L56 25 L59.8 20.5 L61 25.5" fill="none" stroke="#FFE9A0" strokeWidth=".6" opacity=".85"/>
<rect x="49" y="7" width="2" height="6.5" rx=".5" fill="#8A5A00"/><rect x="46.8" y="9" width="6.4" height="1.8" rx=".5" fill="#8A5A00"/>
<circle cx="50" cy="14.8" r="1.9" fill="#8A5A00"/>
<circle cx="38" cy="16.5" r="1.4" fill="#8A5A00"/><circle cx="62" cy="16.5" r="1.4" fill="#8A5A00"/>
<circle cx="43.5" cy="29.8" r="1.05" fill="#C2185B"/><circle cx="50" cy="29.8" r="1.2" fill="#1E40AF"/><circle cx="56.5" cy="29.8" r="1.05" fill="#C2185B"/>
<circle cx="50" cy="22.2" r="1.15" fill="#C2185B"/>
</g>
      <g fill="#FFF3B0" transform="translate(.7 .8)" opacity=".8">
        <path transform="translate(28.59 55.63) scale(0.02068)" d="M242 -117V-644Q149 -641 105.5 -602.5Q62 -564 49 -475H20L23 -676H623L625 -475H596Q583 -564 539.5 -602.5Q496 -641 404 -644V-117Q404 -60 420.5 -45.0Q437 -30 502 -25V0H145V-25Q209 -30 225.5 -45.5Q242 -61 242 -117ZM1375 -25V0H1051V-25Q1072 -28 1083 -28Q1131 -31 1131.0 -61.0Q1131 -91 1085 -197H860L845 -158Q816 -83 816 -66Q816 -47 835.0 -37.5Q854 -28 898 -25V0H695V-25Q731 -32 747.5 -52.0Q764 -72 793 -142L1015 -690H1043L1266 -164Q1303 -76 1322.5 -50.5Q1342 -25 1371 -25ZM875 -236H1070L969 -479ZM1716 -35Q1806 -35 1864.0 -48.0Q1922 -61 1953.0 -94.0Q1984 -127 1995.0 -150.5Q2006 -174 2021 -228Q2024 -237 2025 -241H2051L2025 0H1445V-16L1827 -641Q1808 -640 1779.0 -639.0Q1750 -638 1744 -638Q1632 -638 1586.0 -606.0Q1540 -574 1504 -470H1476L1497 -676H2021V-660L1642 -35Z"/>
      </g>
      <g fill="#7A4D00">
        <path transform="translate(28.59 55.63) scale(0.02068)" d="M242 -117V-644Q149 -641 105.5 -602.5Q62 -564 49 -475H20L23 -676H623L625 -475H596Q583 -564 539.5 -602.5Q496 -641 404 -644V-117Q404 -60 420.5 -45.0Q437 -30 502 -25V0H145V-25Q209 -30 225.5 -45.5Q242 -61 242 -117ZM1375 -25V0H1051V-25Q1072 -28 1083 -28Q1131 -31 1131.0 -61.0Q1131 -91 1085 -197H860L845 -158Q816 -83 816 -66Q816 -47 835.0 -37.5Q854 -28 898 -25V0H695V-25Q731 -32 747.5 -52.0Q764 -72 793 -142L1015 -690H1043L1266 -164Q1303 -76 1322.5 -50.5Q1342 -25 1371 -25ZM875 -236H1070L969 -479ZM1716 -35Q1806 -35 1864.0 -48.0Q1922 -61 1953.0 -94.0Q1984 -127 1995.0 -150.5Q2006 -174 2021 -228Q2024 -237 2025 -241H2051L2025 0H1445V-16L1827 -641Q1808 -640 1779.0 -639.0Q1750 -638 1744 -638Q1632 -638 1586.0 -606.0Q1540 -574 1504 -470H1476L1497 -676H2021V-660L1642 -35Z"/>
      </g>
      <g>
<path d="M27 63 Q50 58 73 63 L73 73.5 Q50 69 27 73.5 Z" fill="#8A5A00"/>
<path d="M27 63 Q50 58 73 63 L73 73.5 Q50 69 27 73.5 Z" fill="none" stroke="#FFE9A0" strokeWidth=".6" opacity=".8" transform="translate(0 .9) scale(1 .98)"/>
<path d="M27 63 L21 66 L24 69 L21 72.5 L27 73.5 Z" fill="#B87700"/>
<path d="M73 63 L79 66 L76 69 L79 72.5 L73 73.5 Z" fill="#B87700"/>
</g>
      {label && (
        <text
          x="50"
          y="69.3"
          textAnchor="middle"
          fontSize={label.fontSize}
          fontWeight="700"
          fill="#FFF3B0"
          style={{ fontFamily: "var(--font-sans), sans-serif" }}
        >
          {label.text}
        </text>
      )}
      <g fill="#8A5A00"><circle cx="50" cy="80.5" r="1.1"/><circle cx="45.5" cy="80" r=".8"/><circle cx="54.5" cy="80" r=".8"/></g>
      <path d="M15 34 A38 38 0 0 1 42 9 Q27 18 19 42 Z" fill={`url(#${p}gl)`} />
    </svg>
  );
}
