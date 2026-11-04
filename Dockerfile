# syntax=docker/dockerfile:1
# Multi-stage: deps → build → minimal runtime (standalone output, non-root).

FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only: env is validated when modules load, and real
# values are injected at runtime. Nothing here ends up in the client bundle.
ENV NODE_ENV=production \
    APP_URL=http://localhost:3000 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-a-real-secret
RUN pnpm build

# Migration image: has drizzle-kit and the SQL files, nothing else runs from it.
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/server/db/schema.ts ./src/server/db/schema.ts
CMD ["node_modules/.bin/drizzle-kit", "migrate"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/storage && chown -R app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
