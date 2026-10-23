import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    // Only these hosts may be used with <Image>. Use the DIRECT link from imgbb
    // (starts with https://i.ibb.co/...). If your links use another host, add it here.
    remotePatterns: [
      { protocol: "https", hostname: "i.ibb.co", pathname: "/**" },
      { protocol: "https", hostname: "i.ibb.co.com", pathname: "/**" },
      // placeholder images used by the seed data in 001_products.sql (remove later)
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
    ],
    // placehold.co serves SVG/PNG; keep SVG blocked unless you really need it
    dangerouslyAllowSVG: false,
    // cache optimized images for 30 days (imgbb images rarely change)
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Do not fail the Vercel build because of lint warnings
  eslint: {
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
