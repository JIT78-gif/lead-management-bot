# ---- Build stage ----
FROM node:22-bookworm-slim AS build

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

# ---- Runtime stage ----
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/app/data/leads.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Persistent volume for the SQLite file
VOLUME ["/app/data"]
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
