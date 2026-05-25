#!/usr/bin/env bash
# Rebuild and restart the repair-cafe-hub container.
#
# Usage:
#   ./rebuild.sh           # rebuild with cache and restart
#   ./rebuild.sh --no-cache # full clean rebuild
#   ./rebuild.sh --pull    # also pull fresh base images

set -euo pipefail

cd "$(dirname "$0")"

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
docker compose build "${BUILD_ARGS[@]}"

echo "==> Recreating container…"
docker compose up -d --force-recreate

echo "==> Pruning dangling images…"
docker image prune -f >/dev/null

echo "==> Done. Tailing logs (Ctrl-C to detach)…"
docker compose logs -f --tail=50
