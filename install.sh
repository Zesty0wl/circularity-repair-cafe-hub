#!/usr/bin/env bash
# Circularity Repair Cafe Hub — installer
#
# Takes a fresh 64-bit Linux machine from zero to a running, publicly reachable
# Repair Cafe Hub behind a Cloudflare Tunnel.
#
# What you need before you start:
#   - A 64-bit Linux machine (a VPS, or a Raspberry Pi 4 or 5 on 64-bit Pi OS)
#   - Root access, either as root or as a user who can run sudo
#   - Internet access
#   - A free Cloudflare account
#   - A domain whose nameservers point at Cloudflare
#
# That last one is the step people most often get wrong. Creating a Cloudflare
# account is not enough. Your domain has to be added to that account and its
# nameservers changed to the ones Cloudflare gives you. This script checks that
# before it changes anything on the machine.
#
# Everything it needs to ask you happens in the first minute. After that you
# can walk away and come back to a working website.
#
# Safe to re-run: every step checks for existing state before acting.
#
# Read it before piping to bash. Curl-bash users:
#   curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh | bash

set -u
set -o pipefail

# ── colour / log helpers ───────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''
fi

step()    { printf '\n%s%s==> %s%s\n' "$C_BOLD" "$C_BLUE" "$1" "$C_RESET"; }
info()    { printf '    %s\n' "$1"; }
ok()      { printf '    %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn()    { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail()    { printf '    %s✗%s %s\n' "$C_RED" "$C_RESET" "$1"; }
die()     { printf '\n%s✗ %s%s\n' "$C_RED" "$1" "$C_RESET" >&2; [[ -n "${2:-}" ]] && printf '  %s\n' "$2" >&2; exit 1; }

# ── config ─────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/Zesty0wl/circularity-repair-cafe-hub.git"
REPO_DIR_NAME="circularity-repair-cafe-hub"
DEFAULT_PORT="5026"
MIN_MEM_MB=1500
MIN_DISK_MB=3000

# ── options ────────────────────────────────────────────────────────────────────
CHECK_ONLY=0
usage() {
  cat <<'USAGE'
Circularity Repair Cafe Hub installer

  ./install.sh              install and publish the hub
  ./install.sh --check      only check this machine is ready, change nothing
  ./install.sh --help       show this

You can answer the questions up front instead of being asked:

  HUB_DOMAIN=repaircafe.yourgroup.org   the web address for your hub
  HUB_TZ=Europe/Berlin                  your local time (default: this machine's)
  HUB_PORT=5026                         the port on this machine to listen on
USAGE
}
for arg in "$@"; do
  case "$arg" in
    --check|--dry-run) CHECK_ONLY=1 ;;
    -h|--help)         usage; exit 0 ;;
    *)                 printf 'Unknown option: %s\n\n' "$arg" >&2; usage >&2; exit 1 ;;
  esac
done

# ── how do we get root? ────────────────────────────────────────────────────────
# Works both as root (typical on a VPS) and as a sudo user (typical on a Pi,
# where root SSH login is switched off).
if [[ "$EUID" -eq 0 ]]; then
  as_root() { "$@"; }
  AM_ROOT=1
else
  AM_ROOT=0
  if ! command -v sudo >/dev/null 2>&1; then
    die "This script needs root, and sudo is not installed." \
        "Either log in as root, or install sudo first:  apt-get update && apt-get install -y sudo"
  fi
  as_root() { sudo "$@"; }
fi

USER_NAME="$(id -un)"
USER_HOME="$HOME"
CF_DIR="$USER_HOME/.cloudflared"

# ── small helpers ──────────────────────────────────────────────────────────────
# Read one answer, falling back to a default. Works when the script has been
# piped into bash, which is how most people will run it.
ask() {
  local prompt="$1" default="${2:-}" answer=""
  # Test that /dev/tty can actually be opened, not just that it exists. It
  # exists but cannot be opened when there is no controlling terminal, which is
  # what happens over "ssh host 'command'" and in automated runs.
  # Do not redirect stderr on these reads. Bash writes the prompt to stderr, and
  # this function is called inside $(...), so stdout is already being captured.
  # Silencing stderr hides the cursor and the script looks like it has hung.
  if { : < /dev/tty; } 2>/dev/null; then
    read -r -p "$prompt" answer < /dev/tty || answer=""
  elif [[ -t 0 ]]; then
    read -r -p "$prompt" answer || answer=""
  fi
  printf '%s' "${answer:-$default}"
}

# Tidy spaces around what was typed or pasted, and lowercase it. Spaces in the
# middle are left alone on purpose, so "repair cafe.org" is rejected rather than
# quietly turned into "repaircafe.org", which is somebody else.
trim_lower() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s" | tr 'A-Z' 'a-z'
}

# ── asking questions so they look like questions ───────────────────────────────
# The checks above scroll past quickly. Without something that clearly stops and
# waits, people do not notice the script is asking them for something.
QUESTION_TOTAL=2
QUESTION_N=0

rule() { printf '%s%s%s\n' "$C_DIM" "──────────────────────────────────────────────────────────────" "$C_RESET"; }

# question <title>
question() {
  QUESTION_N=$((QUESTION_N + 1))
  printf '\n'; rule
  printf '  %sQuestion %d of %d%s\n\n' "$C_CYAN" "$QUESTION_N" "$QUESTION_TOTAL" "$C_RESET"
  printf '  %s%s%s\n\n' "$C_BOLD" "$1" "$C_RESET"
}
qinfo()  { printf '  %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
qhint()  { printf '\n  %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
qclose() { printf '\n'; rule; }

# The line they actually type on. Its own line, bright, and nothing like the
# grey help text above it.
cursor() { printf '%s%s❯%s ' "$C_BOLD" "$C_YELLOW" "$C_RESET"; }

port_in_use() { command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$1 "; }

show_qr() { command -v qrencode >/dev/null 2>&1 && qrencode -t ANSIUTF8 -m 1 "$1" 2>/dev/null || true; }

# ══════════════════════════════════════════════════════════════════════════════
#  1. Everything we need to know, and everything we need to check.
#     Nothing on this machine is changed in this section.
# ══════════════════════════════════════════════════════════════════════════════
step "1/9  Checking this machine, and asking what we need to know"

PREFLIGHT_FAILED=0
note_fail() { fail "$1"; [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; PREFLIGHT_FAILED=1; }

# --- who we are -------------------------------------------------------------
if [[ "$AM_ROOT" -eq 1 ]]; then ok "Running as root"
else ok "Running as $USER_NAME, using sudo where needed"; fi

# --- package manager --------------------------------------------------------
if command -v apt-get >/dev/null 2>&1; then ok "Debian or Ubuntu based system"
else note_fail "This is not a Debian or Ubuntu based system." \
               "The installer uses apt. On other systems, follow the manual steps in the README."; fi

# --- architecture -----------------------------------------------------------
ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
BUILD_FROM_SOURCE=0
case "$ARCH" in
  amd64|arm64) ok "Architecture: $ARCH (a ready-made image is published for this)" ;;
  armhf|arm)
    warn "Architecture: $ARCH (32-bit)"
    info "  There is no ready-made image, because PostgreSQL publishes no 32-bit Arm packages."
    info "  The image will be built here instead, which needs about 4 GB of memory and 15 to 40 minutes."
    info "  64-bit Raspberry Pi OS is much quicker. Consider reflashing."
    BUILD_FROM_SOURCE=1 ;;
  '') note_fail "Could not work out the architecture (dpkg --print-architecture failed)." ;;
  *)  note_fail "Unsupported architecture: $ARCH" "This installer supports amd64, arm64 and armhf." ;;
esac

# --- memory -----------------------------------------------------------------
MEM_MB="$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')"
if [[ -n "${MEM_MB:-}" ]]; then
  if [[ "$MEM_MB" -ge "$MIN_MEM_MB" ]]; then ok "Memory: ${MEM_MB} MB"
  else
    warn "Memory: ${MEM_MB} MB, which is below the ${MIN_MEM_MB} MB we suggest"
    info "  It may still work. If the app is killed unexpectedly, add swap."
  fi
else warn "Could not read how much memory this machine has"; fi

# --- disk -------------------------------------------------------------------
DISK_MB="$(df -Pm / 2>/dev/null | awk 'NR==2{print $4}')"
if [[ -n "${DISK_MB:-}" ]]; then
  if [[ "$DISK_MB" -ge "$MIN_DISK_MB" ]]; then ok "Free disk space: $((DISK_MB / 1024)) GB"
  else note_fail "Only ${DISK_MB} MB free on /, and about ${MIN_DISK_MB} MB is needed." "Free some space and run this again."; fi
fi

# --- internet ---------------------------------------------------------------
reachable() {
  local code
  code="$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)"
  [[ "$code" =~ ^[1-5][0-9][0-9]$ ]]
}
for target in "https://ghcr.io/v2/" "https://github.com" "https://cloudflare-dns.com"; do
  if reachable "$target"; then ok "Can reach ${target#https://}"
  else note_fail "Cannot reach ${target#https://}" \
                 "Check this machine has internet access and that no firewall is blocking HTTPS."; fi
done

# --- the port ---------------------------------------------------------------
# Only worked out here. If we need to ask about it, that happens below with the
# other questions, so everything we want from a person is in one place.
SERVICE_PORT="${HUB_PORT:-$DEFAULT_PORT}"
PORT_ALT=""
if port_in_use "$SERVICE_PORT"; then
  if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":${SERVICE_PORT}->"; then
    ok "Port ${SERVICE_PORT} is already used by this app (fine, we will update it)"
  else
    warn "Port ${SERVICE_PORT} is already used by something else on this machine"
    for try in $(seq $((SERVICE_PORT + 1)) $((SERVICE_PORT + 20))); do
      port_in_use "$try" || { PORT_ALT="$try"; break; }
    done
    [[ -n "$PORT_ALT" ]] || note_fail "Port ${SERVICE_PORT} is in use and no nearby port is free." \
                                      "Free the port, or re-run with:  HUB_PORT=<number> ./install.sh"
  fi
else
  ok "Port ${SERVICE_PORT} is free"
fi

# ── the questions ──────────────────────────────────────────────────────────────
# Work out how many there are before asking the first, so "Question 1 of 2" is
# honest. The port only comes up when something else is already using it.
QUESTION_TOTAL=2
[[ -n "$PORT_ALT" ]] && QUESTION_TOTAL=3
[[ -n "${HUB_DOMAIN:-}" ]] && QUESTION_TOTAL=$((QUESTION_TOTAL - 1))
[[ -n "${HUB_TZ:-}" ]]     && QUESTION_TOTAL=$((QUESTION_TOTAL - 1))

if [[ -n "$PORT_ALT" ]]; then
  question "Something else is already using port ${SERVICE_PORT}."
  qinfo "The hub needs a free port on this machine. Nothing on the internet"
  qinfo "sees this number, so any free one will do."
  qhint "Type y and press Enter to use port ${PORT_ALT} instead."
  qhint "Type n to stop, so you can free up port ${SERVICE_PORT} yourself."
  printf '\n'
  REPLY_PORT="$(ask "$(cursor)" "y")"
  qclose
  case "$(trim_lower "$REPLY_PORT")" in
    y|yes|"") SERVICE_PORT="$PORT_ALT"; ok "Will use port ${SERVICE_PORT}" ;;
    *) note_fail "Port ${SERVICE_PORT} is in use and you chose not to change it." \
                 "Free the port, or re-run with:  HUB_PORT=<number> ./install.sh" ;;
  esac
fi

# --- the web address --------------------------------------------------------
DOMAIN="${HUB_DOMAIN:-}"
[[ -n "$DOMAIN" ]] && info "Using the web address you passed in: $DOMAIN"
if [[ -z "$DOMAIN" && -f "$CF_DIR/config.yml" ]]; then
  DOMAIN="$(awk '/^[[:space:]]*-[[:space:]]*hostname:/{print $3; exit}' "$CF_DIR/config.yml" 2>/dev/null || true)"
  [[ -n "$DOMAIN" ]] && info "Already set up before. Using: $DOMAIN"
fi

if [[ -z "$DOMAIN" ]]; then
  question "What web address should your Repair Cafe Hub have?"
  qinfo "This is what visitors will type into their browser."
  qinfo "It must be a domain that is already in your Cloudflare account."
  qhint "For example:  repaircafe.yourgroup.org"
  qhint "Type it below and press Enter."
  printf '\n'
  ATTEMPTS=0
  while [[ -z "$DOMAIN" ]]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    DOMAIN="$(trim_lower "$(ask "$(cursor)")")"
    if [[ -z "$DOMAIN" && "$ATTEMPTS" -ge 3 ]]; then
      die "No web address given." \
          "Pass it in instead:  HUB_DOMAIN=repaircafe.yourgroup.org bash install.sh"
    fi
    if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$ ]]; then
      printf '  %s✗ That does not look like a web address. Try again.%s\n\n' "$C_RED" "$C_RESET"
      DOMAIN=""
    fi
  done
  qclose
fi

DOMAIN="$(trim_lower "$DOMAIN")"
DOMAIN_USABLE=1
if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$ ]]; then
  DOMAIN_USABLE=0
  note_fail "\"$DOMAIN\" does not look like a web address." "It should look like  repaircafe.yourgroup.org"
fi

# Walk up the name until a level answers with nameservers, then see whose they are.
NS_VERDICT="unknown"; NS_SEEN=""; probe="$DOMAIN"
while [[ "$DOMAIN_USABLE" -eq 1 && ( "$probe" == *.*.* || "$probe" == *.* ) ]]; do
  resp="$(curl -s --max-time 10 "https://cloudflare-dns.com/dns-query?name=${probe}&type=NS" -H "accept: application/dns-json" 2>/dev/null)"
  if printf '%s' "$resp" | grep -q '"Answer"'; then
    NS_SEEN="$(printf '%s' "$resp" | grep -oE '"data":"[^"]+"' | sed 's/"data":"//;s/"//' | tr '\n' ' ')"
    printf '%s' "$resp" | grep -qi 'ns\.cloudflare\.com' && NS_VERDICT="cloudflare" || NS_VERDICT="elsewhere"
    break
  fi
  next="${probe#*.}"; [[ "$next" == "$probe" ]] && break; probe="$next"
done

case "$NS_VERDICT" in
  cloudflare) ok "$probe is on Cloudflare" ;;
  elsewhere)
    note_fail "$probe is not using Cloudflare's nameservers." "It currently uses: ${NS_SEEN:-unknown}"
    printf '      %s\n' "Add the domain to your Cloudflare account, then change the nameservers at"
    printf '      %s\n' "your registrar to the two Cloudflare gives you. It usually takes a few"
    printf '      %s\n' "minutes to an hour to take effect. Then run this script again." ;;
  *)
    [[ "$DOMAIN_USABLE" -eq 1 ]] && note_fail "We could not find $DOMAIN in the DNS at all." \
      "Check the spelling. If you have only just bought the domain, it can take a little while to appear." ;;
esac

# --- the timezone -----------------------------------------------------------
# Detect it and let them correct it. Asking cold is no good, because most people
# do not know that the answer looks like "Europe/Berlin".
# Timezone names are case sensitive (Europe/Berlin), so this is not lowercased.
DETECTED_TZ="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || true)"
DETECTED_TZ="$(printf '%s' "$DETECTED_TZ" | tr -d '[:space:]')"
[[ -n "$DETECTED_TZ" ]] || DETECTED_TZ="Europe/London"

TIMEZONE="${HUB_TZ:-}"
if [[ -n "$TIMEZONE" ]]; then
  info "Using the timezone you passed in: $TIMEZONE"
else
  question "Where is your cafe?"
  qinfo "Event times, session dates and reports all use this. If it is"
  qinfo "wrong, every time shown on your site will be out."
  printf '\n  This machine thinks it is in %s%s%s.\n' "$C_BOLD" "$DETECTED_TZ" "$C_RESET"
  qhint "Press Enter on its own to accept ${DETECTED_TZ}."
  qhint "Or type a different one, like Europe/London, then press Enter."
  printf '\n'
  TIMEZONE="$(ask "$(cursor)" "$DETECTED_TZ")"
  TIMEZONE="$(printf '%s' "$TIMEZONE" | tr -d '[:space:]')"
  qclose
fi

if [[ -f "/usr/share/zoneinfo/$TIMEZONE" ]]; then
  ok "Timezone: $TIMEZONE"
else
  note_fail "\"$TIMEZONE\" is not a timezone this machine knows." \
            "Use a name like Europe/London or America/New_York. The full list is at
      https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
fi

# --- the tunnel name --------------------------------------------------------
# Derived from the web address, so two cafes sharing one Cloudflare account can
# never collide on a fixed name.
TUNNEL_NAME="$(printf '%s' "$DOMAIN" | tr '.' '-' | tr -cd 'a-z0-9-')"
[[ -n "$TUNNEL_NAME" ]] || TUNNEL_NAME="repair-cafe"
ok "Tunnel will be called: $TUNNEL_NAME"

if [[ "$PREFLIGHT_FAILED" -ne 0 ]]; then
  die "This machine is not ready yet." "Fix the items marked ✗ above, then run this script again. Nothing has been changed."
fi
ok "Everything checks out. Nothing has been changed yet."

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  printf '\n%s%sThis machine is ready to install the Repair Cafe Hub.%s\n' "$C_GREEN" "$C_BOLD" "$C_RESET"
  printf 'Nothing was changed. Run it without --check when you are ready.\n\n'
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
#  2. Cloudflare login. This is the last thing that needs a human, so it goes
#     early. Everything after it runs on its own.
# ══════════════════════════════════════════════════════════════════════════════
step "2/9  Signing in to Cloudflare"

if [[ -f "$CF_DIR/config.yml" ]]; then
  ok "Already set up on this machine. Nothing to sign in to."
elif [[ -f "$CF_DIR/cert.pem" ]]; then
  ok "Already signed in to Cloudflare"
else
  if ! command -v cloudflared >/dev/null 2>&1; then
    DEB_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    DEB_TMP="/tmp/cloudflared-${ARCH}.deb"
    info "Installing the Cloudflare Tunnel client…"
    curl -fsSL -o "$DEB_TMP" "$DEB_URL" \
      || die "Could not download cloudflared for $ARCH." "Try opening this in a browser to check: $DEB_URL"
    if ! as_root dpkg -i "$DEB_TMP" >/dev/null 2>&1; then
      as_root apt-get install -fy >/dev/null 2>&1 || die "Could not install cloudflared." "Inspect:  dpkg -i $DEB_TMP"
    fi
    rm -f "$DEB_TMP"
  fi
  ok "Cloudflare Tunnel client ready: $(cloudflared --version 2>&1 | head -n1 | awk '{print $3}')"

  # Shows the sign-in link as a square you can scan with a phone. Copying a very
  # long link out of a terminal is unreliable, especially over SSH.
  command -v qrencode >/dev/null 2>&1 || as_root apt-get install -y qrencode >/dev/null 2>&1 || true

  mkdir -p "$CF_DIR"
  LOGIN_LOG="$(mktemp)"
  cloudflared tunnel login >"$LOGIN_LOG" 2>&1 &
  LOGIN_PID=$!

  LOGIN_URL=""
  for _ in $(seq 1 30); do
    LOGIN_URL="$(grep -oE 'https://dash\.cloudflare\.com/argotunnel[^[:space:]]*' "$LOGIN_LOG" 2>/dev/null | head -n1)"
    [[ -n "$LOGIN_URL" ]] && break
    kill -0 "$LOGIN_PID" 2>/dev/null || break
    sleep 1
  done

  if [[ -n "$LOGIN_URL" ]]; then
    printf '\n'; rule
    printf '  %sOver to you. This is the last thing that needs a person.%s\n\n' "$C_CYAN" "$C_RESET"
    printf '  %s1.%s Scan the square below with your phone camera.\n' "$C_BOLD" "$C_RESET"
    printf '     %s(or open the link underneath it on any computer)%s\n' "$C_DIM" "$C_RESET"
    printf '  %s2.%s Sign in to Cloudflare.\n' "$C_BOLD" "$C_RESET"
    printf '  %s3.%s Choose %s%s%s from the list.\n' "$C_BOLD" "$C_RESET" "$C_BOLD" "$probe" "$C_RESET"
    printf '  %s4.%s Click %sAuthorize%s.\n\n' "$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET"
    show_qr "$LOGIN_URL"
    printf '\n  %s\n\n' "$LOGIN_URL"
    rule
    printf '\n  %sWaiting for you to approve it…%s\n' "$C_DIM" "$C_RESET"
  else
    warn "Could not read the sign-in link. cloudflared said:"
    cat "$LOGIN_LOG"
  fi

  wait "$LOGIN_PID" || die "The Cloudflare sign-in did not finish." "Run this script again when you are ready to try once more."
  rm -f "$LOGIN_LOG"
  [[ -f "$CF_DIR/cert.pem" ]] || die "Cloudflare did not send back a certificate." "Run this script again to retry."
  ok "Signed in to Cloudflare"
fi

printf '\n%sThat is everything we need from you. The rest takes a few minutes.%s\n' "$C_GREEN" "$C_RESET"

# ══════════════════════════════════════════════════════════════════════════════
#  3. Docker
# ══════════════════════════════════════════════════════════════════════════════
step "3/9  Docker"

if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker…"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh || die "Could not download the Docker install script."
  as_root sh /tmp/get-docker.sh >/dev/null 2>&1 \
    || die "The Docker install script failed." "Try running it by hand:  sudo sh /tmp/get-docker.sh"
  rm -f /tmp/get-docker.sh

  if [[ "$AM_ROOT" -eq 0 ]]; then
    as_root usermod -aG docker "$USER_NAME"
    cat <<EOF

${C_YELLOW}${C_BOLD}Docker has just been installed.${C_RESET}

For your account to be allowed to use it, you must ${C_BOLD}log out and back in${C_RESET}
(or reboot), then run this script again:

  ${C_BOLD}exit${C_RESET}   # or reboot
  # log back in, then
  ${C_BOLD}cd ~/$REPO_DIR_NAME && ./install.sh${C_RESET}

Your Cloudflare sign-in has been saved, so it will not ask again.

EOF
    exit 0
  fi
fi
ok "Docker present: $(docker --version)"

docker info >/dev/null 2>&1 || {
  [[ "$AM_ROOT" -eq 0 ]] \
    && die "Docker is installed but your account cannot use it." \
           "If you were just added to the docker group, log out and back in, then run this again." \
    || die "Docker is installed but not responding." "Try:  systemctl start docker   then run this again."
}
docker compose version >/dev/null 2>&1 \
  || die "Docker Compose v2 is not available." "Recent Docker installs include it. Try:  apt-get install -y docker-compose-plugin"
ok "Docker Compose v2 present: $(docker compose version --short 2>/dev/null || echo ok)"

# ══════════════════════════════════════════════════════════════════════════════
#  4. Files
# ══════════════════════════════════════════════════════════════════════════════
step "4/9  Getting the files"

if [[ -f "./docker-compose.yml" && -f "./.env.example" ]]; then
  REPO_DIR="$(pwd)"
  ok "Using the copy already here: $REPO_DIR"
else
  REPO_DIR="$USER_HOME/$REPO_DIR_NAME"
  if [[ -d "$REPO_DIR/.git" ]]; then
    ok "Already downloaded to $REPO_DIR. Getting the newest version."
    git -C "$REPO_DIR" pull --ff-only >/dev/null 2>&1 || warn "Could not update. Carrying on with what is here."
  else
    command -v git >/dev/null 2>&1 || { info "Installing git…"; as_root apt-get update -y >/dev/null; as_root apt-get install -y git >/dev/null; }
    info "Downloading to $REPO_DIR"
    git clone --quiet "$REPO_URL" "$REPO_DIR" \
      || die "Download failed." "Check the internet connection and that $REPO_URL can be reached."
    ok "Downloaded"
  fi
fi
cd "$REPO_DIR" || die "Could not open $REPO_DIR"

# ══════════════════════════════════════════════════════════════════════════════
#  5. Settings
# ══════════════════════════════════════════════════════════════════════════════
step "5/9  Settings file"

[[ -f .env ]] || cp .env.example .env 2>/dev/null || touch .env

# Put a key/value into .env, replacing whatever was there.
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if grep -qE '^SECRET_KEY=.{32,}$' .env 2>/dev/null && ! grep -q 'please-change-me' .env; then
  ok "SECRET_KEY already set. Leaving it alone."
else
  SECRET="$(openssl rand -hex 32 2>/dev/null)"
  [[ -n "$SECRET" ]] || die "Could not generate a secret." "Install openssl:  apt-get install -y openssl"
  set_env SECRET_KEY "$SECRET"
  ok "Wrote a fresh SECRET_KEY"
fi

set_env TZ "$TIMEZONE";           ok "Timezone set to $TIMEZONE"
set_env HUB_PORT "$SERVICE_PORT"; ok "Listening on port $SERVICE_PORT"

# ══════════════════════════════════════════════════════════════════════════════
#  6. Start it
# ══════════════════════════════════════════════════════════════════════════════
step "6/9  Starting the Repair Cafe Hub"

if [[ "$BUILD_FROM_SOURCE" -eq 0 ]]; then
  info "Downloading the ready-made image (usually 1 to 3 minutes)…"
  if docker compose pull; then ok "Image downloaded"
  else
    warn "Could not download the image. It will be built here instead."
    warn "That needs about 4 GB of memory and takes 15 to 40 minutes."
    BUILD_FROM_SOURCE=1
  fi
fi

if [[ "$BUILD_FROM_SOURCE" -eq 1 ]]; then
  docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build \
    || die "Building the container failed." "See what happened with:  docker compose logs"
else
  docker compose up -d || die "Starting the container failed." "See what happened with:  docker compose logs"
fi
ok "The hub is running on this machine, on port ${SERVICE_PORT}"

# ══════════════════════════════════════════════════════════════════════════════
#  7. The tunnel
# ══════════════════════════════════════════════════════════════════════════════
step "7/9  Setting up the tunnel"

mkdir -p "$CF_DIR"
if [[ -f "$CF_DIR/config.yml" ]]; then
  ok "Already set up. Leaving the existing tunnel alone."
  TUNNEL_ID="$(awk '/^tunnel:/{print $2; exit}' "$CF_DIR/config.yml" 2>/dev/null | tr -d '[:space:]' || true)"
else
  # Find a tunnel's id by name. Uses python3 when it is there, because picking a
  # field out of JSON with text tools is asking for trouble. The fallback puts
  # each tunnel on its own line, which keeps a name and its id together.
  tunnel_id_for() {
    local json
    json="$(cloudflared tunnel list --output json 2>/dev/null)" || return 1
    [[ -n "$json" ]] || return 1
    if command -v python3 >/dev/null 2>&1; then
      printf '%s' "$json" | python3 -c '
import sys, json
name = sys.argv[1]
try:
    tunnels = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for t in tunnels or []:
    if t.get("name") == name:
        print(t.get("id", ""))
        break
' "$TUNNEL_NAME" 2>/dev/null
    else
      printf '%s' "$json" | tr '{' '\n' | grep -F "\"name\":\"$TUNNEL_NAME\"" \
        | grep -oE '"id":"[^"]+"' | head -n1 | sed 's/.*:"//;s/"$//'
    fi
  }

  TUNNEL_ID="$(tunnel_id_for || true)"
  if [[ -z "${TUNNEL_ID:-}" ]]; then
    info "Creating a tunnel called '$TUNNEL_NAME'…"
    cloudflared tunnel create "$TUNNEL_NAME" >/dev/null \
      || die "Could not create the tunnel." "Check what already exists with:  cloudflared tunnel list"
    TUNNEL_ID="$(tunnel_id_for || true)"
    [[ -n "${TUNNEL_ID:-}" ]] || die "Could not find the tunnel after creating it." "Check with:  cloudflared tunnel list"
    ok "Created tunnel $TUNNEL_ID"
  else
    ok "Tunnel '$TUNNEL_NAME' already exists ($TUNNEL_ID)"
  fi

  CREDS_FILE="$CF_DIR/${TUNNEL_ID}.json"
  [[ -f "$CREDS_FILE" ]] || die "The tunnel's credentials file is missing: $CREDS_FILE" \
      "If this tunnel was made on another machine, remove it with:  cloudflared tunnel delete $TUNNEL_NAME"

  info "Pointing $DOMAIN at the tunnel…"
  if cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" >/dev/null 2>&1; then
    ok "DNS record created"
  else
    warn "The DNS step reported a problem. This is usually fine if the record already exists."
    warn "Check in Cloudflare under DNS for a CNAME '$DOMAIN' pointing at '${TUNNEL_ID}.cfargotunnel.com'."
  fi

  cat > "$CF_DIR/config.yml" <<EOF
# Cloudflare Tunnel settings for the Circularity Repair Cafe Hub.
# Written by install.sh on $(date -Iseconds)
tunnel: $TUNNEL_ID
credentials-file: $CREDS_FILE

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$SERVICE_PORT
  - service: http_status:404
EOF
  ok "Tunnel settings written"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  8. Start the tunnel at boot
# ══════════════════════════════════════════════════════════════════════════════
step "8/9  Making the tunnel start automatically"

if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\.service'; then
  ok "Already set up as a system service"
else
  [[ -n "${TUNNEL_ID:-}" ]] || die "Could not work out the tunnel id from $CF_DIR/config.yml" "Look at the file and run this again."
  info "Copying the settings to /etc/cloudflared so the system can read them…"
  as_root mkdir -p /etc/cloudflared
  as_root cp "$CF_DIR/config.yml" /etc/cloudflared/config.yml
  as_root cp "$CF_DIR/${TUNNEL_ID}.json" "/etc/cloudflared/${TUNNEL_ID}.json"
  as_root sed -i "s|^credentials-file: .*|credentials-file: /etc/cloudflared/${TUNNEL_ID}.json|" /etc/cloudflared/config.yml
  as_root chown -R root:root /etc/cloudflared
  as_root chmod 600 "/etc/cloudflared/${TUNNEL_ID}.json"
  # --config has to be given explicitly. We keep a copy of the settings in both
  # ~/.cloudflared and /etc/cloudflared, and cloudflared refuses to guess which
  # one the service should use when it finds two.
  #
  # The output is captured rather than thrown away, so that when this fails the
  # person running it can see cloudflared's own reason instead of just ours.
  if ! SVC_OUT="$(as_root cloudflared --config /etc/cloudflared/config.yml service install 2>&1)"; then
    printf '\n'
    printf '%s\n' "$SVC_OUT" | sed 's/^/      /'
    die "Could not install the tunnel as a system service." \
        "cloudflared's own explanation is just above."
  fi
  ok "System service installed"
fi

as_root systemctl enable --now cloudflared >/dev/null 2>&1 \
  || die "Could not start the tunnel service." "Look at the logs with:  journalctl -u cloudflared -n 50"

for _ in $(seq 1 10); do as_root systemctl is-active --quiet cloudflared && break; sleep 1; done
if as_root systemctl is-active --quiet cloudflared; then ok "Tunnel is running"
else warn "The tunnel is not running yet. Check with:  systemctl status cloudflared"; fi

# ══════════════════════════════════════════════════════════════════════════════
#  9. Done
# ══════════════════════════════════════════════════════════════════════════════
step "9/9  All done"

SITE="https://${DOMAIN}"
cat <<EOF

${C_GREEN}${C_BOLD}Your Repair Cafe Hub is live.${C_RESET}

  ${C_BOLD}${SITE}${C_RESET}

Scan this to open it on a phone:

EOF
show_qr "$SITE"
cat <<EOF

It can take a minute for the address to start working the very first time.

The first time you open it, it will walk you through creating your admin
account and filling in your cafe's details.

If something looks wrong, run this and send us what it prints:
  ${C_BOLD}cd $REPO_DIR && ./doctor.sh${C_RESET}

Useful commands:
  ${C_BOLD}docker compose ps${C_RESET}                 what the app is doing
  ${C_BOLD}docker compose logs -f${C_RESET}            the app's logs
  ${C_BOLD}systemctl status cloudflared${C_RESET}      the tunnel
  ${C_BOLD}journalctl -u cloudflared -f${C_RESET}      the tunnel's logs

To update later:
  ${C_BOLD}cd $REPO_DIR && git pull && docker compose pull && docker compose up -d${C_RESET}

EOF
