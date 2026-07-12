# inspot-dashboard — multi-stage Docker build (NFR-DEPLOY-001, ADR-002:
# scrypt hashing uses Node's built-in `crypto`, so no native build toolchain
# is required in any stage).

# ---- deps: install dependencies only (cached layer) ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: `postinstall` runs `prisma generate`, which needs
# prisma/schema.prisma — not copied into this cache-only layer. The builder
# stage generates the client explicitly once the full source is present.
RUN npm ci --ignore-scripts

# ---- builder: generate Prisma client + build the Next.js app ----
FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime: minimal image that runs migrations then starts the app ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

# Apply the full schema (Decision P-1) then start the app.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
