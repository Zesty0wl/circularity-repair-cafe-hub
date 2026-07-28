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
#
# It does not rebuild blindly. Most hours nobody has touched the site, and
# there is nothing to clean up, so it works out whether a rebuild is worth
# doing first. See should_rebuild() for what counts.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1
# Kept outside the checkout so git pull never touches it.
STATE_DIR=/var/lib/repaircafe-demo
STATE="$STATE_DIR/reset-state"
# Never let a rebuild be put off for longer than this, however busy the site
# looks. Somebody poking it every few minutes must not be able to keep a
# defaced demo up indefinitely.
MAX_DEFERRALS=3

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

# ── is a rebuild worth doing? ─────────────────────────────────────────────────
# A fingerprint of everything the database would show a visitor. If it matches
# the one taken at the end of the last rebuild, nobody has changed anything.
# The audit log covers signing in and checking an item in; the counts and the
# newest timestamps cover anything that edits a row without being audited.
# Only cafes, events, repair_jobs and users carry updated_at. The rest are
# insert-only from a visitor's point of view, so a count and the newest
# created_at is enough to notice a change. Getting this wrong is quiet: psql
# writes the error to stderr and prints nothing, so the fingerprint comes back
# empty and every comparison fails. Hence the warning below rather than 2>/dev/null.
fingerprint() {
  local out err
  err="$(mktemp)"
  out="$(docker exec circularity-repair-cafe-hub psql -U circularity -d circularity -tAc "
    SELECT
      (SELECT COALESCE(MAX(id),0) FROM audit_log),
      (SELECT COUNT(*) FROM repair_jobs),  (SELECT COALESCE(MAX(updated_at)::text,'') FROM repair_jobs),
      (SELECT COUNT(*) FROM events),       (SELECT COALESCE(MAX(updated_at)::text,'') FROM events),
      (SELECT COUNT(*) FROM users),        (SELECT COALESCE(MAX(updated_at)::text,'') FROM users),
      (SELECT COALESCE(MAX(updated_at)::text,'') FROM cafes),
      (SELECT COUNT(*) FROM venues),       (SELECT COALESCE(MAX(created_at)::text,'') FROM venues),
      (SELECT COUNT(*) FROM cafe_gallery), (SELECT COALESCE(MAX(created_at)::text,'') FROM cafe_gallery),
      (SELECT COUNT(*) FROM event_images), (SELECT COALESCE(MAX(created_at)::text,'') FROM event_images),
      (SELECT COUNT(*) FROM skill_categories)
  " 2>"$err" | tr -d ' \n')"
  if [[ -z "$out" ]]; then
    warn "Could not read the database: $(head -2 "$err" | tr '\n' ' ')"
  fi
  rm -f "$err"
  printf '%s' "$out"
}

# Seconds since the newest audit entry, or a big number if there is none.
seconds_since_activity() {
  local secs
  secs="$(docker exec circularity-repair-cafe-hub psql -U circularity -d circularity -tAc \
    "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(created_at)))::bigint, 999999) FROM audit_log" \
    2>/dev/null | tr -d ' \n')"
  [[ "$secs" =~ ^[0-9]+$ ]] && printf '%s' "$secs" || printf '999999'
}

WAS_FP=""; WAS_DAY=""; WAS_IMAGE=""; DEFERRALS=0
# shellcheck disable=SC1090
[[ -r "$STATE" ]] && . "$STATE"

say "Working out whether a rebuild is needed"
REASON=""
NOW_IMAGE="$(docker image inspect --format '{{.Id}}' \
  "ghcr.io/zesty0wl/circularity-repair-cafe-hub:${HUB_VERSION:-latest}" 2>/dev/null || echo none)"

if [[ "$FORCE" -eq 1 ]]; then
  REASON="you asked for it"
elif [[ -z "$WAS_FP" ]]; then
  REASON="there is no record of a previous rebuild"
elif ! docker compose ps --status running 2>/dev/null | grep -q circularity-repair-cafe-hub; then
  REASON="the hub is not running"
elif [[ "$WAS_DAY" != "$(date +%F)" ]]; then
  # The seed dates a session today and leaves it running. Left alone overnight
  # it would show visitors an open session dated yesterday, so the day rolling
  # over is reason enough on its own.
  REASON="the date has changed, so today's session is out of date"
else
  # Ask the registry whether there is a newer release. The demo follows
  # `latest`, which makes each rebuild a check that the release we tell cafes
  # to install still works. Skipping that check would lose the point of it.
  docker compose pull >/dev/null 2>&1
  PULLED_IMAGE="$(docker image inspect --format '{{.Id}}' \
    "ghcr.io/zesty0wl/circularity-repair-cafe-hub:${HUB_VERSION:-latest}" 2>/dev/null || echo none)"
  NOW_IMAGE="$PULLED_IMAGE"
  NOW_FP="$(fingerprint)"

  if [[ "$PULLED_IMAGE" != "$WAS_IMAGE" ]]; then
    REASON="a new release has been published"
  elif [[ -z "$NOW_FP" ]]; then
    REASON="the database could not be read"
  elif [[ "$NOW_FP" != "$WAS_FP" ]]; then
    IDLE="$(seconds_since_activity)"
    if [[ "$IDLE" -lt 600 && "$DEFERRALS" -lt "$MAX_DEFERRALS" ]]; then
      # Somebody is looking at it right now. Wiping the site out from under a
      # visitor mid-click is the rudest thing this script could do, and it will
      # still be here to clean up in an hour.
      DEFERRALS=$((DEFERRALS + 1))
      # Replace the line rather than appending one. The state file is sourced,
      # so the name has to match exactly and the count has to actually move,
      # otherwise the cap never bites and a busy site is never cleaned up.
      if grep -q '^DEFERRALS=' "$STATE" 2>/dev/null; then
        sed -i "s/^DEFERRALS=.*/DEFERRALS=${DEFERRALS}/" "$STATE"
      else
        printf 'DEFERRALS=%s\n' "$DEFERRALS" >> "$STATE"
      fi
      ok "Somebody was using it ${IDLE}s ago. Leaving them alone (deferral ${DEFERRALS} of ${MAX_DEFERRALS})."
      exit 0
    fi
    REASON="somebody has changed something"
  fi
fi

if [[ -z "$REASON" ]]; then
  ok "Nothing has changed and nobody has been in. Leaving it as it is."
  exit 0
fi
ok "Rebuilding because ${REASON}"

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
  # Remember what a clean, untouched demo looks like, so next hour can tell
  # whether anybody has been in. Only written after the checks pass, so a
  # half-built site is never mistaken for a good one.
  mkdir -p "$STATE_DIR"
  {
    printf 'WAS_FP=%q\n'    "$(fingerprint)"
    printf 'WAS_DAY=%q\n'   "$(date +%F)"
    printf 'WAS_IMAGE=%q\n' "$(docker image inspect --format '{{.Id}}' \
      "ghcr.io/zesty0wl/circularity-repair-cafe-hub:${HUB_VERSION:-latest}" 2>/dev/null || echo none)"
    printf 'DEFERRALS=0\n'
  } > "$STATE"

  printf '%s%sDemo rebuilt: %s%s\n' "$G" "$B" "$PUBLIC_URL" "$N"
  printf 'Started %s, finished %s\n\n' "$STARTED" "$(date -Is)"
else
  die "The demo was rebuilt but did not pass its checks. See the warnings above."
fi
