# ClearCut web — Next.js 16 standalone, deployed to Cloud Run.
#
# Bun owns dependency resolution (bun.lock is the source of truth). Node runs
# `next build` and the resulting server, because Bun cannot execute Next's
# webpack CJS output: both the build's page-data collection and the standalone
# server fail with "Expected CommonJS module to have a function wrapper".
# This is scoped to the Next.js process only — the API, and every ADK/Gemini/
# Parallel call in it, runs on Bun.

FROM oven/bun:1.3.8 AS deps
WORKDIR /app

# Frozen-lockfile installs resolve the whole workspace graph, so every manifest
# has to be present before `bun install` runs.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/edge/package.json ./apps/edge/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/ui/package.json ./packages/ui/

RUN bun install --frozen-lockfile

FROM node:24-slim AS build
WORKDIR /app

# Carry over every node_modules tree, not just the root one: Bun installs
# per-workspace, and `next` itself lives in apps/web/node_modules.
COPY --from=deps /app ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && node node_modules/next/dist/bin/next build --webpack

# Guard against a build that reports success without emitting the entrypoint.
RUN test -f apps/web/.next/standalone/apps/web/server.js \
    || (echo "standalone server.js was not emitted by next build" && exit 1)

FROM node:24-slim AS release
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT; Next's standalone server reads PORT and HOSTNAME, and
# must bind 0.0.0.0 or Cloud Run cannot route traffic to the container.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

# Standalone ships its own traced node_modules. Static assets are deliberately
# excluded from that trace, so they are copied in separately.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
CMD ["node", "apps/web/server.js"]
