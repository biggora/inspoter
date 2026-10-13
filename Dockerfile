FROM node:24-slim AS base
WORKDIR /app
ENV COREPACK_HOME=/corepack
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable \
    && corepack prepare pnpm@11.28.2 --activate \
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
# next/font/google under Turbopack fails intermittently when Google Fonts
# answers with extensionless /l/font?kit=...&skey=... URLs (vercel/next.js
# #99114, still open; checked in 16.3.3, 16.3.8 and 16.5 canary), so a
# version pin does not help. Retry the build, but only when the log points at
# the fonts, so real build errors still fail on the first attempt.
RUN DATABASE_URL="postgresql://build_user:build_password@127.0.0.1:3833/inspoter_e2e_test?schema=public" \
    OPERATOR_USERNAME=build-operator \
    OPERATOR_PASSWORD=build-only-password \
    sh -c 'for attempt in 1 2 3; do \
        pnpm run build > /tmp/build.log 2>&1 && { cat /tmp/build.log; exit 0; }; \
        cat /tmp/build.log; \
        grep -qE "font/google|Google Fonts" /tmp/build.log || exit 1; \
        echo "Google Fonts request failed (attempt $attempt of 3)"; sleep 10; \
    done; exit 1'

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
COPY --from=builder --chown=node:node /app/scripts/migrate-deploy.mjs ./scripts/migrate-deploy.mjs
COPY --from=builder --chown=node:node /app/scripts/legacy-agent-token-preflight.mjs ./scripts/legacy-agent-token-preflight.mjs
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
RUN chown node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm run db:migrate && exec pnpm run start"]
