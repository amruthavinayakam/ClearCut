import type { NextConfig } from "next";

const apiOrigin = process.env.CLEARCUT_API_ORIGIN ?? "https://clearcut-api.lcl";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["clearcut.lcl"],
  transpilePackages: ["@clearcut/contracts", "@clearcut/ui"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
