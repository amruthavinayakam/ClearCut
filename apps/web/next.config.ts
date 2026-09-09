import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run ships the traced standalone server rather than the whole workspace.
  output: "standalone",
  // next build/dev run with apps/web as the cwd; trace from the workspace root
  // so the standalone output includes the linked @clearcut/* packages.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  allowedDevOrigins: ["clearcut.lcl"],
  transpilePackages: ["@clearcut/contracts", "@clearcut/ui"],
  // `/api/*` is served in every environment by the streaming route handler in
  // src/app/api/[...path]/route.ts. There used to be a development-only rewrite
  // here, but Next's rewrite proxy cannot carry a streamed request body: a 12MB
  // rough cut that the API accepts in 0.34s went through it for 65 seconds and
  // came back 500, so uploading any real video from the browser failed. The
  // route handler passes the body through with `duplex: "half"` and keeps SSE
  // unbuffered, which is what this app needs in both directions.
};

export default nextConfig;
