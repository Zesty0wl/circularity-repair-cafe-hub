#!/usr/bin/env bash
# Build the repair-cafe-hub image from this checkout and restart the container.
#
# Most people do not need this. To run the published image, use:
#   docker compose pull && docker compose up -d
# Use this script when you have changed the code, or when there is no published
# image for your architecture.
#
# Usage:
#   ./rebuild.sh           # rebuild with cache and restart
#   ./rebuild.sh --no-cache # full clean rebuild
#   ./rebuild.sh --pull    # also pull fresh base images

set -euo pipefail

cd "$(dirname "$0")"

# Both files together: the main one for settings, the build one to compile from
# source instead of downloading the published image.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.build.yml)

BUILD_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-cache) BUILD_ARGS+=(--no-cache) ;;
    --pull)     BUILD_ARGS+=(--pull) ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f .env ]]; then
  echo "Warning: .env not found — SECRET_KEY and other env vars may be missing." >&2
fi

echo "==> Building image…"
"${COMPOSE[@]}" build "${BUILD_ARGS[@]}"

echo "==> Recreating container…"
"${COMPOSE[@]}" up -d --force-recreate

echo "==> Pruning dangling images…"
docker image prune -f >/dev/null

echo "==> Done. Tailing logs (Ctrl-C to detach)…"
"${COMPOSE[@]}" logs -f --tail=50
