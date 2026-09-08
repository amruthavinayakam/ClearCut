import path from "node:path";

import type { NextConfig } from "next";

const apiOrigin = process.env.CLEARCUT_API_ORIGIN ?? "https://clearcut-api.lcl";

const nextConfig: NextConfig = {
  // Cloud Run ships the traced standalone server rather than the whole workspace.
  output: "standalone",
  // next build/dev run with apps/web as the cwd; trace from the workspace root
  // so the standalone output includes the linked @clearcut/* packages.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  allowedDevOrigins: ["clearcut.lcl"],
  transpilePackages: ["@clearcut/contracts", "@clearcut/ui"],
  async rewrites() {
    // Development only. In production `/api/*` is served by the streaming route
    // handler in src/app/api/[...path]/route.ts — Next 16's rewrite proxy both
    // buffers text/event-stream bodies and currently 500s against an external
    // origin in a standalone build, and this app depends on live SSE.
    if (process.env.NODE_ENV === "production") return [];

    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
