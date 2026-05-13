# ──────────────────────────────────────────────
# Stage 1 — Backend build (Node + TypeScript)
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS backend-build

WORKDIR /app

# Build deps for better-sqlite3 native compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev deps for runtime
RUN npm prune --omit=dev

# ──────────────────────────────────────────────
# Stage 2 — Frontend build (Vite + React)
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS web-build

WORKDIR /app/web

COPY web/package.json web/package-lock.json* ./
RUN npm install

COPY web/tsconfig.json web/tsconfig.app.json web/tsconfig.node.json ./
COPY web/vite.config.ts web/index.html ./
COPY web/src ./src
RUN npm run build

# ──────────────────────────────────────────────
# Stage 3 — Runtime
# ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/app/data/leads.db

# Backend
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/package.json ./package.json

# Frontend (Fastify serves these as static files under /dashboard/*)
COPY --from=web-build /app/web/dist ./web/dist

# Persistent volume for the SQLite file
VOLUME ["/app/data"]
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
