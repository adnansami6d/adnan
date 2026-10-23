import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

// Bangla + Latin font, loaded by Next.js at build time (no layout shift)
const font = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Clothing Shop",
    template: "%s | Clothing Shop",
  },
  description: "টি-শার্ট, হুডি ও আরও অনেক কিছু। ক্যাশ অন ডেলিভারি, সারা বাংলাদেশে ডেলিভারি।",
  openGraph: {
    type: "website",
    locale: "bn_BD",
    siteName: "Clothing Shop",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className={font.variable}>
      <body className="min-h-screen bg-white font-sans text-neutral-900 antialiased">
        {/* <Navbar />  -- added when components/Navbar.tsx is written */}
        <main>{children}</main>
        {/* <Footer />  -- added when components/Footer.tsx is written */}
      </body>
    </html>
  );
  }
    
