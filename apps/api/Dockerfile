# ClearCut API — Bun + Hono, deployed to Cloud Run.
#
# ffmpeg is not optional: apps/api/src/media/probe.ts shells out to ffprobe to
# validate every uploaded rough cut, and services/uploads.ts turns a missing
# binary into a silent `unreadable_container` rejection. Without it the whole
# page-to-screen half of the product fails closed in production.
#
# Dependencies are installed *after* the workspace source is in place. Installing
# from manifests alone and copying node_modules across stages produces
# @clearcut/* symlinks that Cloud Build's classic builder does not carry over,
# and the container dies with "Cannot find module '@clearcut/integrations'".

FROM oven/bun:1.3.8
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/edge/package.json ./apps/edge/
COPY apps/web/package.json ./apps/web/
COPY fixtures ./fixtures

RUN bun install --frozen-lockfile --production

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
