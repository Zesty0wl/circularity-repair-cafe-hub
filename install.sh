#!/usr/bin/env bash
# Circularity Repair Cafe Hub — Raspberry Pi installer
#
# Takes a fresh Raspberry Pi OS Lite 64-bit install from zero to a running,
# publicly-accessible Repair Cafe Hub via Cloudflare Tunnel.
#
# Safe to re-run: every step checks for existing state before acting.
#
# Read it before piping to bash. Curl-bash users:
#   curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh | bash

set -u
set -o pipefail

# ── colour / log helpers ───────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=''; C_BOLD=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''
fi

step()    { printf '\n%s%s==> %s%s\n' "$C_BOLD" "$C_BLUE" "$1" "$C_RESET"; }
info()    { printf '    %s\n' "$1"; }
ok()      { printf '    %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn()    { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
die()     { printf '\n%s✗ %s%s\n' "$C_RED" "$1" "$C_RESET" >&2; [[ -n "${2:-}" ]] && printf '  %s\n' "$2" >&2; exit 1; }

# ── config ─────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/Zesty0wl/circularity-repair-cafe-hub.git"
REPO_DIR_NAME="circularity-repair-cafe-hub"
TUNNEL_NAME="repair-cafe"
SERVICE_PORT="5026"   # host port from docker-compose.yml

# ── preflight ──────────────────────────────────────────────────────────────────
step "Preflight checks"

if [[ "$EUID" -eq 0 ]]; then
  die "Do not run this script as root." \
      "Run it as your normal user. The script will use sudo only for the steps that need it."
fi

if ! command -v sudo >/dev/null 2>&1; then
  die "sudo is not installed." \
      "Install it first:  apt-get update && apt-get install -y sudo"
fi

# Sanity check sudo works (will prompt for password if needed). One prompt up front
# is friendlier than three later.
if ! sudo -v; then
  die "Could not obtain sudo." "Make sure your user is in the sudo group."
fi

ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
case "$ARCH" in
  arm64|armhf|amd64) ok "Detected architecture: $ARCH" ;;
  '')               die "Could not detect architecture (dpkg --print-architecture failed)." ;;
  *)                die "Unsupported architecture: $ARCH" \
                        "This installer supports arm64, armhf and amd64." ;;
esac

USER_NAME="$(id -un)"
USER_HOME="$HOME"
ok "Installing as user: $USER_NAME ($USER_HOME)"

# ── 1. Docker ──────────────────────────────────────────────────────────────────
step "1/8  Docker"

if ! command -v docker >/dev/null 2>&1; then
  info "Docker is not installed. Installing via get.docker.com…"
  if ! curl -fsSL https://get.docker.com -o /tmp/get-docker.sh; then
    die "Failed to download the Docker install script."
  fi
  if ! sudo sh /tmp/get-docker.sh; then
    die "Docker install script failed." "Try running it manually:  sudo sh /tmp/get-docker.sh"
  fi
  rm -f /tmp/get-docker.sh

  info "Adding $USER_NAME to the docker group…"
  sudo usermod -aG docker "$USER_NAME"

  cat <<EOF

${C_YELLOW}${C_BOLD}Docker has just been installed.${C_RESET}

For the docker group membership to take effect, you must ${C_BOLD}log out and back in${C_RESET}
(or reboot the Pi), then re-run this script:

  ${C_BOLD}exit${C_RESET}   # or reboot
  # SSH back in
  ${C_BOLD}cd ~/$REPO_DIR_NAME && ./install.sh${C_RESET}

EOF
  exit 0
fi
ok "Docker present: $(docker --version)"

if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but the current user can't talk to the daemon." \
      "If you just added yourself to the docker group, log out and back in (or reboot), then re-run this script."
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose v2 is not available." \
      "Recent Docker installs include it as a plugin. Try:  sudo apt-get install -y docker-compose-plugin"
fi
ok "Docker Compose v2 present: $(docker compose version --short 2>/dev/null || echo ok)"

# ── 2. Clone repo (or detect we're inside it) ─────────────────────────────────
step "2/8  Source code"

# If we're being run from inside an existing clone, use that.
if [[ -f "./docker-compose.yml" && -f "./Dockerfile" && -f "./.env.example" ]]; then
  REPO_DIR="$(pwd)"
  ok "Using existing checkout at $REPO_DIR"
else
  REPO_DIR="$USER_HOME/$REPO_DIR_NAME"
  if [[ -d "$REPO_DIR/.git" ]]; then
    ok "Repo already cloned at $REPO_DIR — pulling latest"
    git -C "$REPO_DIR" pull --ff-only || warn "git pull failed; continuing with current checkout"
  else
    info "Cloning $REPO_URL → $REPO_DIR"
    if ! command -v git >/dev/null 2>&1; then
      info "Installing git…"
      sudo apt-get update -y
      sudo apt-get install -y git
    fi
    if ! git clone "$REPO_URL" "$REPO_DIR"; then
      die "git clone failed." "Check your network connection and that $REPO_URL is reachable."
    fi
    ok "Cloned to $REPO_DIR"
  fi
fi

cd "$REPO_DIR" || die "Could not cd into $REPO_DIR"

# ── 3. .env ────────────────────────────────────────────────────────────────────
step "3/8  Environment file (.env)"

if [[ -f .env ]]; then
  ok ".env already exists — leaving it untouched"
else
  if [[ ! -f .env.example ]]; then
    die ".env.example is missing." "Expected to find it at $REPO_DIR/.env.example"
  fi
  cp .env.example .env
  SECRET="$(openssl rand -hex 32 2>/dev/null)"
  if [[ -z "$SECRET" ]]; then
    die "openssl rand failed." "Install openssl:  sudo apt-get install -y openssl"
  fi
  # Escape for sed: SECRET is hex so no special chars, but be defensive.
  sed -i "s|please-change-me-32-or-more-random-chars|$SECRET|" .env
  ok "Wrote .env with a fresh SECRET_KEY"
fi

# ── 4. Build & start container ────────────────────────────────────────────────
step "4/8  Build and start the container"
info "Running:  docker compose up -d --build  (this can take 5–15 min on a Pi)"
if ! docker compose up -d --build; then
  die "docker compose up failed." \
      "See logs with:  docker compose logs"
fi
ok "Container is up. Check status with:  docker compose ps"

# ── 5. Install cloudflared ─────────────────────────────────────────────────────
step "5/8  cloudflared (Cloudflare Tunnel client)"

if command -v cloudflared >/dev/null 2>&1; then
  ok "cloudflared already installed: $(cloudflared --version 2>&1 | head -n1)"
else
  DEB_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  DEB_TMP="/tmp/cloudflared-${ARCH}.deb"
  info "Downloading $DEB_URL"
  if ! curl -fsSL -o "$DEB_TMP" "$DEB_URL"; then
    die "Failed to download cloudflared .deb for $ARCH." \
        "Check the URL in a browser: $DEB_URL"
  fi
  info "Installing the .deb…"
  if ! sudo dpkg -i "$DEB_TMP"; then
    info "dpkg reported a problem. Trying to fix missing dependencies…"
    sudo apt-get install -fy || die "Could not install cloudflared." "Inspect:  sudo dpkg -i $DEB_TMP"
  fi
  rm -f "$DEB_TMP"
  ok "cloudflared installed: $(cloudflared --version 2>&1 | head -n1)"
fi

# ── 6. Tunnel login / create / DNS / config ───────────────────────────────────
step "6/8  Cloudflare Tunnel"

CF_DIR="$USER_HOME/.cloudflared"
mkdir -p "$CF_DIR"

if [[ -f "$CF_DIR/config.yml" ]]; then
  ok "$CF_DIR/config.yml already exists — skipping tunnel creation."
  warn "To start over, delete $CF_DIR and /etc/cloudflared, then re-run this script."
else
  # 6a. login
  if [[ ! -f "$CF_DIR/cert.pem" ]]; then
    cat <<EOF

${C_BOLD}Cloudflare login required.${C_RESET}

We're about to run:  ${C_BOLD}cloudflared tunnel login${C_RESET}

This will print a URL. You need to:
  1. Copy the URL into a browser on any device (your laptop, phone, etc.)
  2. Log in to your Cloudflare account
  3. Choose the domain you want to use for this Repair Cafe Hub
  4. Click ${C_BOLD}Authorize${C_RESET}

The script will continue automatically once the certificate is downloaded.

EOF
    read -r -p "Press Enter when you're ready to start the login flow… " _
    if ! cloudflared tunnel login; then
      die "cloudflared tunnel login failed." \
          "Re-run this script when you're ready to try again."
    fi
    ok "Cloudflare cert downloaded to $CF_DIR/cert.pem"
  else
    ok "Cloudflare cert already present at $CF_DIR/cert.pem"
  fi

  # 6b. create tunnel (idempotent: if it exists, just look up the ID)
  TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null \
    | python3 -c "import sys, json; tunnels = json.load(sys.stdin); print(next((t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'), ''))" 2>/dev/null || true)"

  if [[ -z "$TUNNEL_ID" ]]; then
    info "Creating tunnel '$TUNNEL_NAME'…"
    if ! cloudflared tunnel create "$TUNNEL_NAME"; then
      die "cloudflared tunnel create failed." \
          "Tunnel name may already be taken on another machine — try:  cloudflared tunnel list"
    fi
    TUNNEL_ID="$(cloudflared tunnel list --output json \
      | python3 -c "import sys, json; tunnels = json.load(sys.stdin); print(next((t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'), ''))")"
    if [[ -z "$TUNNEL_ID" ]]; then
      die "Could not determine tunnel ID after creation." \
          "Run:  cloudflared tunnel list   and inspect the output."
    fi
    ok "Created tunnel '$TUNNEL_NAME' with id $TUNNEL_ID"
  else
    ok "Tunnel '$TUNNEL_NAME' already exists (id $TUNNEL_ID)"
  fi

  CREDS_FILE="$CF_DIR/${TUNNEL_ID}.json"
  if [[ ! -f "$CREDS_FILE" ]]; then
    die "Expected credentials file not found: $CREDS_FILE" \
        "If this tunnel was created on a different machine, delete it with:  cloudflared tunnel delete $TUNNEL_NAME"
  fi

  # 6c. domain + DNS route
  DOMAIN=""
  while [[ -z "$DOMAIN" ]]; do
    printf '\n%sEnter the public hostname you want for this Repair Cafe Hub%s\n' "$C_BOLD" "$C_RESET"
    printf '  (e.g. repaircafe.example.org — the domain must already be in your Cloudflare account)\n'
    read -r -p '  Hostname: ' DOMAIN
    DOMAIN="$(printf '%s' "$DOMAIN" | tr -d '[:space:]')"
    if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
      warn "That doesn't look like a hostname — try again."
      DOMAIN=""
    fi
  done

  info "Creating DNS route: $DOMAIN  →  $TUNNEL_NAME"
  if ! cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"; then
    warn "DNS route command returned non-zero. This is often fine if the record already exists."
    warn "Verify in Cloudflare → DNS that there is a CNAME '$DOMAIN' → '${TUNNEL_ID}.cfargotunnel.com'"
  fi

  # 6d. write config.yml
  info "Writing $CF_DIR/config.yml"
  cat > "$CF_DIR/config.yml" <<EOF
# Cloudflare Tunnel config for Circularity Repair Cafe Hub
# Generated by install.sh on $(date -Iseconds)
tunnel: $TUNNEL_ID
credentials-file: $CREDS_FILE

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$SERVICE_PORT
  - service: http_status:404
EOF
  ok "Wrote tunnel config"
fi

# ── 7. systemd service ────────────────────────────────────────────────────────
step "7/8  Install cloudflared as a systemd service"

if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\.service'; then
  ok "cloudflared.service already installed"
else
  # Re-derive TUNNEL_ID in case we took the 'config exists' branch above.
  if [[ -z "${TUNNEL_ID:-}" ]]; then
    TUNNEL_ID="$(grep -E '^tunnel:' "$CF_DIR/config.yml" | awk '{print $2}' | tr -d '[:space:]' || true)"
  fi
  if [[ -z "$TUNNEL_ID" ]]; then
    die "Could not determine tunnel id from $CF_DIR/config.yml" \
        "Inspect the file and re-run this script."
  fi

  info "Copying config and credentials to /etc/cloudflared (needed for the system service)"
  sudo mkdir -p /etc/cloudflared
  sudo cp "$CF_DIR/config.yml" /etc/cloudflared/config.yml
  sudo cp "$CF_DIR/${TUNNEL_ID}.json" "/etc/cloudflared/${TUNNEL_ID}.json"
  # Rewrite credentials-file to the /etc/cloudflared path so root can read it.
  sudo sed -i "s|^credentials-file: .*|credentials-file: /etc/cloudflared/${TUNNEL_ID}.json|" /etc/cloudflared/config.yml
  sudo chown -R root:root /etc/cloudflared
  sudo chmod 600 "/etc/cloudflared/${TUNNEL_ID}.json"

  info "Running:  sudo cloudflared service install"
  if ! sudo cloudflared service install; then
    die "cloudflared service install failed." \
        "Check the output above and try:  sudo cloudflared --config /etc/cloudflared/config.yml service install"
  fi
  ok "Systemd service installed"
fi

info "Enabling and starting cloudflared.service…"
sudo systemctl enable --now cloudflared || die "Could not enable/start cloudflared.service" \
    "Check logs with:  sudo journalctl -u cloudflared -n 50"

sleep 2
if sudo systemctl is-active --quiet cloudflared; then
  ok "cloudflared.service is active"
else
  warn "cloudflared.service is not active yet. Check:  sudo systemctl status cloudflared"
fi

# ── 8. Done ────────────────────────────────────────────────────────────────────
step "8/8  All done"

PUBLIC_DOMAIN="${DOMAIN:-$(grep -E '^\s*-\s*hostname:' "$CF_DIR/config.yml" 2>/dev/null | head -n1 | awk '{print $3}')}"

cat <<EOF

${C_GREEN}${C_BOLD}Your Repair Cafe Hub is live.${C_RESET}

  ${C_BOLD}URL:${C_RESET}     https://${PUBLIC_DOMAIN:-<your-domain>}
  ${C_BOLD}Local:${C_RESET}   http://127.0.0.1:${SERVICE_PORT}  (only reachable on this Pi)

Useful commands:
  ${C_BOLD}docker compose ps${C_RESET}                 — container status
  ${C_BOLD}docker compose logs -f${C_RESET}            — app logs
  ${C_BOLD}sudo systemctl status cloudflared${C_RESET} — tunnel status
  ${C_BOLD}sudo journalctl -u cloudflared -f${C_RESET} — tunnel logs

To update later:
  ${C_BOLD}cd $REPO_DIR && git pull && docker compose up -d --build${C_RESET}

First-run setup will start the moment you visit the URL above. Enjoy.
EOF
