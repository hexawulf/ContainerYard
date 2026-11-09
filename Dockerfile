# syntax=docker/dockerfile:1
# ContainerYard — multi-arch production image (linux/amd64, linux/arm64).
#
# Stage 1 (`build`) runs on $BUILDPLATFORM because the Vite client bundle and
# esbuild server bundle are architecture-independent.
# Stage 2 (`deps`) installs production node_modules, native bcrypt, and target-arch
# Prisma engines + CLI for runtime `prisma db push --skip-generate`.
# Stage 3 (`runtime`) is a minimal Debian Bookworm slim runtime running as uid 1000.

ARG NODE_IMAGE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

# --- Stage 1: build client + server bundles on $BUILDPLATFORM -----------------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

ARG SOURCE_DATE_EPOCH=
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}

WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY server/prisma ./server/prisma

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

# --- Stage 2: target-arch production dependencies + Prisma CLI/engines --------
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json prisma.config.ts ./
COPY server/prisma ./server/prisma

# Install prod dependencies without running postinstall yet, then install the
# matching Prisma CLI from package-lock.json so runtime `prisma db push --skip-generate`
# works without fetching from npm at container boot.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && PRISMA_VER="$(node -p "require('./node_modules/@prisma/client/package.json').version")" \
    && npm install --no-save --omit=dev --ignore-scripts --no-audit --no-fund "prisma@${PRISMA_VER}" \
    && ./node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma \
    && node -e "require('bcrypt'); require('@prisma/client'); console.log('Native addons verified');" \
    && rm -rf /root/.npm /tmp/* \
    && find node_modules/@prisma/engines -type f \( -name "*introspection-engine*" -o -name "*prisma-fmt*" -o -name "*migration-engine*" \) -delete 2>/dev/null || true \
    && rm -rf \
       node_modules/prisma/build/public \
       node_modules/@prisma/studio-core \
       node_modules/lucide-react \
       node_modules/recharts \
       node_modules/date-fns \
       node_modules/@xterm \
       node_modules/@tanstack \
       node_modules/@radix-ui \
       node_modules/react-dom \
       node_modules/react \
       node_modules/typescript 2>/dev/null || true

# --- Stage 3: minimal production runtime --------------------------------------
FROM ${NODE_IMAGE} AS runtime

ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown

LABEL org.opencontainers.image.title="ContainerYard" \
      org.opencontainers.image.description="Self-hosted Docker observability dashboard with real-time log streaming, stack management, and metrics" \
      org.opencontainers.image.source="https://github.com/hexawulf/ContainerYard" \
      org.opencontainers.image.url="https://containeryard.org" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data \
    && chown -R node:node /data /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node server/prisma/schema.prisma ./server/prisma/schema.prisma
COPY --chown=node:node server/prisma/seed.js ./server/prisma/seed.js
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod 0755 /app/docker/entrypoint.sh

ENV NODE_ENV=production \
    PORT=5008

EXPOSE 5008

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 5008) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
