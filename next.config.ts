import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      // BAS/1C's exchange-publication wizard expects this exact filename
      // — the real handler lives at /api/1c-exchange (see docs/1c-exchange.md).
      { source: "/1c_exchange.php", destination: "/api/1c-exchange" },
    ];
  },
};

export default nextConfig;
