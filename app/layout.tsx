import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Bodoni_Moda, Montserrat } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NavProgress from "@/components/NavProgress";
import "./globals.css";

// Bangla + Latin font, loaded by Next.js at build time (no layout shift)
const font = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  display: "swap",
  variable: "--font-sans",
});

// Logo fonts: italic serif for "Taz", small spaced sans for "FASHION"
const logoFont = Bodoni_Moda({
  subsets: ["latin"],
  style: "italic",
  weight: "500",
  display: "swap",
  variable: "--font-logo",
});
const logoSans = Montserrat({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  variable: "--font-logo-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Taz Fashion",
    template: "%s | Taz Fashion",
  },
  description: "টি-শার্ট, হুডি ও আরও অনেক কিছু। ক্যাশ অন ডেলিভারি, সারা বাংলাদেশে ডেলিভারি।",
  openGraph: {
    type: "website",
    locale: "bn_BD",
    siteName: "Taz Fashion",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f4f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className={`${font.variable} ${logoFont.variable} ${logoSans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans text-neutral-900 antialiased">
        <NavProgress />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
