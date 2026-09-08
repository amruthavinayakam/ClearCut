# ClearCut API — Bun + Hono, deployed to Cloud Run.
#
# ffmpeg is not optional: apps/api/src/media/probe.ts shells out to ffprobe to
# validate every uploaded rough cut, and services/uploads.ts turns a missing
# binary into a silent `unreadable_container` rejection. Without it the whole
# page-to-screen half of the product fails closed in production.

FROM oven/bun:1.3.8 AS deps
WORKDIR /app

# Every workspace manifest must be present before a frozen-lockfile install:
# Bun resolves the whole workspace graph, not just the app being shipped.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/edge/package.json ./apps/edge/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/ui/package.json ./packages/ui/

# --production drops every workspace's devDependencies (playwright, wrangler,
# vitest, the Next toolchain). The API needs none of them at runtime and they
# dominate the image size, which is what Cloud Run cold starts pay for.
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.8 AS release
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY fixtures ./fixtures

ENV NODE_ENV=production
# Cloud Run injects PORT and requires the process to bind 0.0.0.0, not loopback.
ENV HOST=0.0.0.0
ENV PORT=8080
# The default (.clearcut/assets, relative to the app dir) is not writable by the
# non-root user, which turns every upload into a 500. Cloud Run's filesystem is
# in-memory and per-instance, so /tmp is the correct home for staged media.
ENV ASSET_STORAGE_DIR=/tmp/clearcut-assets
EXPOSE 8080

USER bun
WORKDIR /app/apps/api
CMD ["bun", "run", "src/server.ts"]
