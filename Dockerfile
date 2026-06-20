# syntax=docker/dockerfile:1

# iread — multi-stage build. The web/build toolchain (vite, tsc, react, tailwind,
# …) lives only in the builder; the final image carries Node, the five runtime
# dependencies, and the compiled dist/ — nothing else.

# ---- builder: full dependency set, compile server + bundle web -> dist/ ----
FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
# Manifests first so the install layer is cached until they actually change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# tsc server build (-> dist/server, dist/shared) + vite client build (-> dist/web).
RUN pnpm build

# ---- prod-deps: resolve ONLY the five runtime dependencies ----
FROM node:24-slim AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime: Node + prod deps + dist, unprivileged, data in /data ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/iread.db \
    OPML_PATH=/data/feeds.opml
# The SQLite DB and the OPML mirror live in /data; make it a volume owned by the
# unprivileged `node` user that ships with the official image.
RUN mkdir -p /data && chown node:node /data
# package.json carries "type": "module", so it must sit next to dist/ for Node to
# load the emitted .js as ESM (it is not otherwise read at runtime).
COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
EXPOSE 8787
VOLUME ["/data"]
# Liveness: exercises the HTTP server and a DB read.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/feeds').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# index.js opens the DB (runs migrations), syncs the OPML mirror, serves API + web.
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]
