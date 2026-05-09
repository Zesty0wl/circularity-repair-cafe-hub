# syntax=docker/dockerfile:1.7

###############################################################################
# Stage 1 — builder: install deps, build shared, web (SvelteKit) and server   #
###############################################################################
# Use the bookworm-slim Node image so native modules (bcrypt, sharp) link
# against glibc and are compatible with the Debian runtime stage.
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 build-essential \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy lockfile + manifests first for layer caching
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json    ./apps/server/
COPY apps/web/package.json       ./apps/web/

RUN pnpm install --frozen-lockfile=false

# Copy source
COPY packages/shared ./packages/shared
COPY apps/server    ./apps/server
COPY apps/web       ./apps/web

# Build shared first (TS → dist), then web (Vite → build/), then server (TS → dist)
RUN pnpm --filter @circularity/shared build \
 && pnpm --filter @circularity/web    build \
 && pnpm --filter @circularity/server build

# Prune dev deps for the server only — keep production node_modules
RUN pnpm --filter @circularity/server deploy --prod /app/server-bundle

###############################################################################
# Stage 2 — runtime: Debian slim with PostgreSQL 16, Node 22, s6-overlay      #
###############################################################################
FROM debian:bookworm-slim AS runtime

ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.0.2
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    TZ=Europe/London \
    NODE_ENV=production \
    PGDATA=/data/postgres \
    UPLOADS_DIR=/data/uploads \
    DATABASE_URL=postgresql://circularity:circularity@127.0.0.1:5432/circularity \
    PORT=3000 \
    S6_KEEP_ENV=1 \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_VERBOSITY=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg locales tini xz-utils tzdata gosu lsb-release \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16 postgresql-client-16 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen

# s6-overlay (multi-arch)
RUN set -eux; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) S6_ARCH=x86_64 ;; \
      arm64) S6_ARCH=aarch64 ;; \
      armhf|arm) S6_ARCH=arm ;; \
      *) S6_ARCH=x86_64 ;; \
    esac; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" -o /tmp/s6-noarch.tar.xz; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" -o /tmp/s6-arch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-noarch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-arch.tar.xz; \
    rm -f /tmp/s6-*.tar.xz

# App
WORKDIR /app
COPY --from=builder /app/server-bundle           /app/server
COPY --from=builder /app/apps/web/build          /app/public

# s6-overlay services + bootstrap scripts (force exec bit so it works regardless of host umask)
COPY --chmod=755 docker/s6-rc.d        /etc/s6-overlay/s6-rc.d
COPY --chmod=755 docker/cont-init.d    /etc/cont-init.d

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/init"]
