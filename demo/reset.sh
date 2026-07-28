#!/usr/bin/env bash
# Wipe the public demo site and build it again from nothing.
#
# Meant to run on the hour, from cron, on the machine that hosts the demo. Even
# if somebody has spent the last hour renaming things and deleting events, the
# next visitor gets a clean, believable repair cafe.
#
#   cd ~/circularity-repair-cafe-hub && ./demo/reset.sh
#
# It runs in two passes on purpose. Demo mode refuses every upload, including
# the photographs the seed needs to put there, so the hub is started with demo
# mode OFF, seeded, and then restarted with it ON. There is a window of about a
# minute where uploads would be accepted; nobody knows the site is up mid-reset,
# and the whole thing is wiped an hour later anyway.
#
# Safe to run at any time. It never touches anything but this project's own
# container and volume.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if [[ -t 1 ]]; then B=$'\033[1m'; G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; N=$'\033[0m'
else B=''; G=''; R=''; Y=''; N=''; fi
say()  { printf '\n%s==> %s%s\n' "$B" "$1" "$N"; }
ok()   { printf '    %s✓%s %s\n' "$G" "$N" "$1"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$1"; }
die()  { printf '\n%s✗ %s%s\n' "$R" "$1" "$N" >&2; exit 1; }

STARTED=$(date -Is)
PUBLIC_URL="${DEMO_PUBLIC_URL:-https://repaircafe.hyperspanner.net}"
PORT="$(grep -E '^HUB_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
[[ -n "${PORT:-}" ]] || PORT=5026
LOCAL="http://127.0.0.1:${PORT}"

command -v docker  >/dev/null || die "Docker is not installed."
command -v python3 >/dev/null || die "python3 is not installed. Try: apt-get install -y python3"
[[ -f .env ]] || die "No .env here. Run this from the folder the hub was installed into."

# ── 1. throw everything away ──────────────────────────────────────────────────
say "Wiping the current demo"
DEMO_MODE=false docker compose down -v --remove-orphans >/dev/null 2>&1
ok "Container and database removed"

# ── 2. take the newest release ────────────────────────────────────────────────
# The demo tracks `latest`, so this doubles as a daily check that the release
# we are telling cafes to install actually works.
say "Fetching the newest released image"
if DEMO_MODE=false docker compose pull >/dev/null 2>&1; then
  ok "Up to date"
else
  warn "Could not pull. Carrying on with the image already here."
fi

# ── 3. start it with uploads allowed, so the seed can add photographs ────────
say "Starting the hub, with demo mode off so the seed can add photographs"
DEMO_MODE=false docker compose up -d --force-recreate >/dev/null 2>&1 \
  || die "The hub would not start. Look at:  docker compose logs --tail=50"
ok "Running"

# ── 4. build the cafe ────────────────────────────────────────────────────────
say "Filling it with a repair cafe"
if ! python3 demo/seed.py --base-url "$LOCAL" --public-url "$PUBLIC_URL"; then
  die "Seeding failed. The demo is empty and needs looking at.
     This usually means a release has changed something the seed relies on,
     which is exactly what the demo is here to catch."
fi

# ── 5. lock it down ──────────────────────────────────────────────────────────
say "Turning demo mode on"
DEMO_MODE=true docker compose up -d --force-recreate >/dev/null 2>&1 \
  || die "Could not restart in demo mode."

for _ in $(seq 1 40); do
  curl -fsS --max-time 3 "${LOCAL}/api/health" >/dev/null 2>&1 && break
  sleep 3
done

# ── 6. prove it ──────────────────────────────────────────────────────────────
say "Checking it took"
FAILED=0
robots="$(curl -fsS --max-time 10 "${LOCAL}/robots.txt" 2>/dev/null | head -2 | tr '\n' ' ')"
[[ "$robots" == *"Disallow: /"* ]] && ok "Search engines are shut out" \
  || { warn "robots.txt is not blocking: $robots"; FAILED=1; }

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
        -X POST -F 'file=@/dev/null' "${LOCAL}/api/checkin/x/jobs/1/image" 2>/dev/null)"
[[ "$code" == "403" ]] && ok "Uploads are refused (HTTP 403)" \
  || { warn "An upload was not refused: HTTP $code"; FAILED=1; }

stats="$(curl -fsS --max-time 10 "${LOCAL}/api/public/stats" 2>/dev/null)"
repairs="$(printf '%s' "$stats" | grep -oE '"repairCount":[0-9]+' | cut -d: -f2)"
[[ "${repairs:-0}" -gt 0 ]] && ok "The cafe has ${repairs} repairs in it" \
  || { warn "No repairs found. The demo looks empty."; FAILED=1; }

printf '\n'
if [[ "$FAILED" -eq 0 ]]; then
  printf '%s%sDemo rebuilt: %s%s\n' "$G" "$B" "$PUBLIC_URL" "$N"
  printf 'Started %s, finished %s\n\n' "$STARTED" "$(date -Is)"
else
  die "The demo was rebuilt but did not pass its checks. See the warnings above."
fi
