FROM oven/bun:1.3.8

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY fixtures ./fixtures

RUN bun install --frozen-lockfile --production

WORKDIR /app/apps/api
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "src/server.ts"]
