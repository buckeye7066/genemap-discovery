# Production image for the @genemap/api Fastify service.
# Multi-stage so the runtime image carries only built artifacts + prod deps.

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Enable corepack for pnpm.
RUN corepack enable

# Copy workspace manifests so pnpm can install just the API + its workspace
# dependencies (shared package).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY packages/shared/package.json ./packages/shared/

# Install with frozen lockfile — fail the build if it would drift.
RUN pnpm install --frozen-lockfile --filter @genemap/api... --filter @genemap/shared

# ─── build stage ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/api/node_modules ./services/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services ./services
COPY packages ./packages

# Build shared package (TypeScript) so API can consume the compiled output.
RUN pnpm --filter @genemap/shared build

# Generate Prisma client for the runtime engine.
RUN pnpm --filter @genemap/api db:generate

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN corepack enable

# Copy only what we need to run the API.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/api ./services/api
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

# Run as a non-root user.
RUN groupadd --system app && useradd --system --gid app --home /app app && chown -R app:app /app
USER app

EXPOSE 3000

# Apply committed migrations against $DATABASE_URL, then start the server.
# `migrate deploy` is non-interactive and will refuse to run if the schema
# diverges from migration history — that's a feature, not a bug.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema services/api/prisma/schema.prisma && node services/api/src/index.js"]
