#!/usr/bin/env bash
# Circularity Repair Cafe Hub — check-up
#
# Run this when something is not working. It looks at every part of the setup
# and says, in plain English, what is fine and what is not.
#
#   ./doctor.sh
#
# It only reads things. It never changes anything, so it is always safe to run.
# If you are asking for help, run it and send us everything it prints.

set -u
set -o pipefail

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BLUE=$'\033[34m'
else
  C_RESET=''; C_BOLD=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_BLUE=''
fi

PROBLEMS=0
WARNINGS=0

section() { printf '\n%s%s— %s%s\n' "$C_BOLD" "$C_BLUE" "$1" "$C_RESET"; }
good()    { printf '  %s✓%s %s\n' "$C_GREEN"  "$C_RESET" "$1"; }
bad()     { printf '  %s✗%s %s\n' "$C_RED"    "$C_RESET" "$1"; PROBLEMS=$((PROBLEMS + 1)); [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; }
meh()     { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; WARNINGS=$((WARNINGS + 1)); [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; }
note()    { printf '    %s\n' "$1"; }

cd "$(dirname "$0")" 2>/dev/null || true

printf '%s%sRepair Cafe Hub check-up%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET"
printf 'Run on %s\n' "$(date -Iseconds 2>/dev/null || date)"

# ── this machine ──────────────────────────────────────────────────────────────
section "This machine"
note "System:       $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)"
note "Architecture: $(dpkg --print-architecture 2>/dev/null || uname -m)"

MEM_MB="$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')"
MEM_FREE="$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')"
[[ -n "${MEM_MB:-}" ]] && note "Memory:       ${MEM_MB} MB total, ${MEM_FREE:-?} MB available"

DISK_FREE_MB="$(df -Pm / 2>/dev/null | awk 'NR==2{print $4}')"
if [[ -n "${DISK_FREE_MB:-}" ]]; then
  if   [[ "$DISK_FREE_MB" -lt 500  ]]; then bad  "Disk space is nearly gone: ${DISK_FREE_MB} MB free" "Free some space. The app cannot save photos or back up the database without it."
  elif [[ "$DISK_FREE_MB" -lt 2000 ]]; then meh  "Disk space is getting low: ${DISK_FREE_MB} MB free"
  else                                      good "Disk space: $((DISK_FREE_MB / 1024)) GB free"
  fi
fi

# ── settings ──────────────────────────────────────────────────────────────────
section "Settings"
if [[ -f docker-compose.yml ]]; then good "docker-compose.yml is here"
else bad "docker-compose.yml is missing" "Run this script from the folder the hub was installed into."; fi

if [[ -f .env ]]; then
  if grep -q '^SECRET_KEY=.\{32,\}' .env 2>/dev/null; then good "SECRET_KEY is set and long enough"
  else bad "SECRET_KEY is missing or too short" "It must be 32 characters or more. Make one with:  openssl rand -hex 32"; fi
  if grep -q 'please-change-me' .env 2>/dev/null; then
    bad "SECRET_KEY is still the example value" "Anyone could forge a login. Replace it with:  openssl rand -hex 32"
  fi
  PINNED="$(grep -E '^HUB_VERSION=' .env 2>/dev/null | cut -d= -f2 || true)"
  [[ -n "${PINNED:-}" ]] && note "Pinned to version ${PINNED}"
  CFG_TZ="$(grep -E '^TZ=' .env 2>/dev/null | cut -d= -f2 || true)"
  HOST_TZ="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || true)"
  if [[ -n "${CFG_TZ:-}" ]]; then
    # Servers are very often deliberately set to UTC, so a UTC machine says
    # nothing about where the cafe is. Only flag a real disagreement between
    # two actual places.
    case "${HOST_TZ:-}" in
      ''|UTC|Etc/UTC|Etc/GMT|GMT) good "Timezone: $CFG_TZ" ;;
      "$CFG_TZ")                  good "Timezone: $CFG_TZ" ;;
      *) meh "The hub uses $CFG_TZ but this machine is set to $HOST_TZ" \
             "If that is deliberate, ignore this. If not, every time shown on the site will be out. Change TZ in .env and run:  docker compose up -d" ;;
    esac
  else
    meh "No timezone set, so the hub falls back to Europe/London" "Add a line like  TZ=Europe/Berlin  to .env"
  fi
else
  bad ".env is missing" "Copy .env.example to .env and put a SECRET_KEY in it."
fi

# ── the app ───────────────────────────────────────────────────────────────────
section "The app"
if ! command -v docker >/dev/null 2>&1; then
  bad "Docker is not installed" "Install it with:  curl -fsSL https://get.docker.com | sh"
elif ! docker info >/dev/null 2>&1; then
  bad "Docker is installed but not responding" "Try:  systemctl start docker"
else
  good "Docker is running"
  CID="$(docker ps -aq --filter name=circularity-repair-cafe-hub 2>/dev/null | head -n1)"
  if [[ -z "${CID:-}" ]]; then
    bad "The hub container does not exist" "Start it with:  docker compose up -d"
  else
    STATE="$(docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null)"
    HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID" 2>/dev/null)"
    RESTARTS="$(docker inspect -f '{{.RestartCount}}' "$CID" 2>/dev/null)"
    case "$STATE" in
      running)
        case "$HEALTH" in
          healthy)   good "The hub is running and healthy" ;;
          starting)  meh  "The hub is still starting up" "Give it a minute, then run this again." ;;
          unhealthy) bad  "The hub is running but not healthy" "Look at the logs with:  docker compose logs --tail=50" ;;
          *)         good "The hub is running" ;;
        esac ;;
      exited|dead) bad "The hub has stopped" "Start it with:  docker compose up -d  then check:  docker compose logs --tail=50" ;;
      *)           meh "The hub is in an unexpected state: $STATE" ;;
    esac
    [[ "${RESTARTS:-0}" -gt 3 ]] && meh "It has restarted ${RESTARTS} times, which suggests something is wrong" "Check:  docker compose logs --tail=50"

    RUNNING_IMG="$(docker inspect -f '{{.Config.Image}}' "$CID" 2>/dev/null)"
    note "Image:        ${RUNNING_IMG:-unknown}"
    VER="$(docker exec "$CID" cat /app/APP_VERSION 2>/dev/null || true)"
    [[ -n "${VER:-}" ]] && note "Version:      ${VER}"
  fi

  # local health endpoint, on whichever port this install uses
  PORT="$(grep -E '^HUB_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true)"
  [[ -n "${PORT:-}" ]] || PORT=5026
  if curl -fsS --max-time 8 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    good "The hub answers on this machine (port ${PORT})"
  else
    bad "The hub does not answer on port ${PORT} of this machine" "If it has only just started, wait a minute. Otherwise:  docker compose logs --tail=50"
  fi
fi

# ── is there a newer version? ─────────────────────────────────────────────────
if [[ -n "${VER:-}" ]]; then
  LATEST="$(curl -s --max-time 10 "https://api.github.com/repos/Zesty0wl/circularity-repair-cafe-hub/tags" 2>/dev/null \
            | grep -oE '"name": *"v[0-9]+\.[0-9]+\.[0-9]+"' | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
  if [[ -n "${LATEST:-}" ]]; then
    if [[ "$LATEST" == "$VER" ]]; then good "You are on the newest version ($VER)"
    else meh "Version $LATEST is available, you are on $VER" "Update with:  git pull && docker compose pull && docker compose up -d"; fi
  fi
fi

# ── the tunnel ────────────────────────────────────────────────────────────────
section "The tunnel to the internet"
HOSTNAME_CFG=""
for f in /etc/cloudflared/config.yml "$HOME/.cloudflared/config.yml"; do
  [[ -r "$f" ]] || continue
  HOSTNAME_CFG="$(awk '/^[[:space:]]*-[[:space:]]*hostname:/{print $3; exit}' "$f" 2>/dev/null || true)"
  [[ -n "$HOSTNAME_CFG" ]] && { note "Settings:     $f"; break; }
done

if ! command -v cloudflared >/dev/null 2>&1; then
  meh "cloudflared is not installed" "Without it the site is only reachable on this machine."
else
  good "cloudflared is installed: $(cloudflared --version 2>&1 | head -n1 | awk '{print $3}')"
  if systemctl is-active --quiet cloudflared 2>/dev/null; then
    good "The tunnel service is running"
    CONNS="$(journalctl -u cloudflared --since '-10 min' --no-pager 2>/dev/null | grep -c 'Registered tunnel connection' || true)"
    if [[ "${CONNS:-0}" -gt 0 ]]; then good "Connected to Cloudflare (${CONNS} connections in the last 10 minutes)"
    else meh "No recent connections to Cloudflare found in the logs" "Check with:  journalctl -u cloudflared -n 50"; fi
  else
    bad "The tunnel service is not running" "Start it with:  systemctl enable --now cloudflared  then check:  journalctl -u cloudflared -n 50"
  fi
fi

if [[ -n "${HOSTNAME_CFG:-}" ]]; then
  note "Web address:  https://${HOSTNAME_CFG}"

  DNS_JSON="$(curl -s --max-time 10 "https://cloudflare-dns.com/dns-query?name=${HOSTNAME_CFG}&type=A" -H 'accept: application/dns-json' 2>/dev/null || true)"
  if printf '%s' "$DNS_JSON" | grep -q '"Answer"'; then
    good "The web address resolves"
    printf '%s' "$DNS_JSON" | grep -qE '"data":"(104\.|172\.6[4-9]\.|172\.7[0-1]\.|188\.114\.|162\.15[89]\.)' \
      && good "It points at Cloudflare, so the tunnel can serve it" \
      || meh "It does not look like it points at Cloudflare" "In Cloudflare under DNS, the record for ${HOSTNAME_CFG} needs the orange cloud switched on."
  else
    bad "The web address does not resolve" "In Cloudflare under DNS, check there is a record for ${HOSTNAME_CFG}."
  fi

  CODE="$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "https://${HOSTNAME_CFG}/api/health" 2>/dev/null || true)"
  case "${CODE:-000}" in
    200) good "The site works from the internet" ;;
    000) bad "Could not reach the site from this machine" "This may be a local network issue. Try opening https://${HOSTNAME_CFG} on your phone." ;;
    502|503|504) bad "Cloudflare answers but cannot reach the app (HTTP $CODE)" "The tunnel is up but the app is not responding. Check the app section above." ;;
    530) bad "Cloudflare cannot reach the tunnel (HTTP 530)" "Check the tunnel service:  systemctl status cloudflared" ;;
    *)   meh "The site answered with HTTP $CODE" ;;
  esac
else
  meh "No tunnel settings found" "The site is only reachable on this machine. Run ./install.sh to publish it."
fi

# ── summary ───────────────────────────────────────────────────────────────────
printf '\n%s%s— Summary%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET"
if   [[ "$PROBLEMS" -eq 0 && "$WARNINGS" -eq 0 ]]; then
  printf '  %s%sEverything looks fine.%s\n\n' "$C_GREEN" "$C_BOLD" "$C_RESET"; exit 0
elif [[ "$PROBLEMS" -eq 0 ]]; then
  printf '  %sNothing is broken. %d thing(s) worth a look, marked ! above.%s\n\n' "$C_YELLOW" "$WARNINGS" "$C_RESET"; exit 0
else
  printf '  %s%d problem(s) found, marked ✗ above.%s %d warning(s).\n' "$C_RED" "$PROBLEMS" "$C_RESET" "$WARNINGS"
  printf '  If you are stuck, send everything above to:\n'
  printf '  https://github.com/Zesty0wl/circularity-repair-cafe-hub/issues\n\n'
  exit 1
fi
