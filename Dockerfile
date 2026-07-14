FROM node:24-slim AS base
WORKDIR /app
ENV COREPACK_HOME=/corepack
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable \
    && corepack prepare pnpm@11.12.0 --activate \
    && chmod -R a+rX /corepack

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL="postgresql://build_user:build_password@127.0.0.1:3833/inspoter_e2e_test?schema=public" \
    OPERATOR_USERNAME=build-operator \
    OPERATOR_PASSWORD=build-only-password \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://build_user:build_password@127.0.0.1:3833/inspoter_e2e_test?schema=public" \
    OPERATOR_USERNAME=build-operator \
    OPERATOR_PASSWORD=build-only-password \
    pnpm exec prisma generate
RUN DATABASE_URL="postgresql://build_user:build_password@127.0.0.1:3833/inspoter_e2e_test?schema=public" \
    OPERATOR_USERNAME=build-operator \
    OPERATOR_PASSWORD=build-only-password \
    pnpm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    COREPACK_ENABLE_NETWORK=0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
RUN chown node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec pnpm run start"]
