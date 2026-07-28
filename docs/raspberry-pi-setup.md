# Raspberry Pi setup

This guide takes you from a fresh Raspberry Pi to a publicly accessible Repair
Cafe Hub with a real HTTPS certificate. The whole thing is one Pi, one Docker
container, and one [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
— no port forwarding, no nginx, no certificate renewal to worry about.

> Looking for the VPS / nginx path instead? See the
> [main README](../README.md#advanced-nginx--cloudflare-origin-certificate).
> That path still works and is documented for advanced users.

---

## 1. Prerequisites

- [ ] Raspberry Pi 4 or 5 (a Pi 3 works but will feel sluggish on event day)
- [ ] **Raspberry Pi OS Lite 64-bit (Bookworm)**, freshly flashed. The 64-bit
      version matters: it is the one with a ready-made image, so the Pi never
      has to compile anything.
- [ ] 2 GB of memory, and about 3 GB of free space on the card
- [ ] SSH access to the Pi from your laptop
- [ ] A domain name added to **Cloudflare** (a free account is fine)
- [ ] That domain's DNS records are **proxied through Cloudflare** — the orange
      cloud icon in the DNS tab is on

If you don't have a domain yet, any registrar will do; transferring DNS to
Cloudflare is free and takes about 10 minutes. You only need one subdomain for
this (e.g. `repaircafe.yourgroup.org`).

---

## 2. One-line install

Once SSH'd into the Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh | bash
```

This downloads and runs [`install.sh`](../install.sh), which does everything
listed in section [3](#3-manual-install) below.

> Piping curl into bash makes some people nervous, and rightly so. Read the
> script first if you want to:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh -o install.sh
> less install.sh
> bash install.sh
> ```

The script is **safe to re-run**. If it gets interrupted, or you need to change
something later, just run it again. It skips steps that are already done, and
it remembers your Cloudflare sign-in.

To check the machine is ready before you commit to anything:

```bash
./install.sh --check
```

That runs every check and stops. It changes nothing.

**What it asks you.** Two questions at the start: the web address you want, and
where your cafe is (it suggests the machine's own setting, so usually you just
press Enter). Then it shows a QR code for approving Cloudflare access. Scan it
with your phone, sign in, choose your domain and click Authorize. After that it
runs on its own for a few minutes.

**Running as root or as a normal user.** Both work. On a rented server you are
usually root already, and the whole thing finishes in one pass. On a Pi you are
normally a user with `sudo`, and if Docker had to be installed the script will
ask you to log out, log back in and run it again, so your account picks up
permission to use Docker. That is a Linux quirk, not a bug, and it only happens
on the non-root path.

---

## 3. Manual install

If you'd rather follow the steps yourself, or you want to understand what the
script is doing, here's the same sequence:

### 3.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in for the group change to apply
```

Verify:

```bash
docker --version
docker compose version
docker ps   # should not error
```

### 3.2 Clone the repo

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub
```

### 3.3 Configure `.env`

```bash
cp .env.example .env
sed -i "s|please-change-me-32-or-more-random-chars|$(openssl rand -hex 32)|" .env
```

This generates a 256-bit random secret used to sign auth tokens. **Don't reuse
the example value, ever.**

### 3.4 Download the image and start the container

```bash
docker compose pull
docker compose up -d
```

This downloads a ready-made image, so the Pi does not have to compile anything.
It usually takes 1 to 3 minutes on a normal home connection. We publish one
image that covers both 64-bit Arm (your Pi) and 64-bit Intel/AMD, and Docker
picks the right one.

Once it's done, the app is listening on `127.0.0.1:5026`, that is, only on the
Pi itself. Nothing is exposed to the world yet.

> **On 32-bit Raspberry Pi OS?** There is no ready-made image, because
> PostgreSQL does not publish 32-bit Arm packages. Build one on the Pi instead:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
> ```
> That takes 15 to 40 minutes and needs about 4 GB of memory, so a 2 GB Pi will
> need swap. Reflashing with the 64-bit image is the easier road.

### 3.5 Install `cloudflared`

Detect your CPU architecture:

```bash
dpkg --print-architecture
```

- 64-bit Pi OS on a Pi 3, 4 or 5 → `arm64`
- 32-bit Pi OS on a Pi 3 → `armhf`
- An amd64 server → `amd64`

Then:

```bash
ARCH=$(dpkg --print-architecture)
curl -fsSL -o /tmp/cloudflared.deb \
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
sudo dpkg -i /tmp/cloudflared.deb
```

### 3.6 Log in to Cloudflare

```bash
cloudflared tunnel login
```

This prints a URL and waits. See [section 4](#4-the-cloudflare-login-step)
for what to do with that URL.

### 3.7 Create the tunnel

```bash
cloudflared tunnel create repair-cafe
```

This creates a tunnel called `repair-cafe` and writes its credentials to
`~/.cloudflared/<TUNNEL-ID>.json`. The tunnel ID is a UUID; note it down.

### 3.8 Point your hostname at the tunnel

Replace `repaircafe.yourgroup.org` with your actual hostname:

```bash
cloudflared tunnel route dns repair-cafe repaircafe.yourgroup.org
```

This adds a `CNAME` record in Cloudflare for that hostname pointing at the
tunnel.

### 3.9 Write the tunnel config

Edit (or create) `~/.cloudflared/config.yml` — substitute your tunnel ID, your
home directory, and your hostname:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /home/pi/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: repaircafe.yourgroup.org
    service: http://localhost:5026
  - service: http_status:404
```

The two `ingress` rules say: "send traffic for that hostname to the container,
and reject everything else." The terminal `http_status:404` is required.

### 3.10 Install the service

`cloudflared` needs to run as root so it can survive reboots as a systemd unit.
Copy the config and credentials to `/etc/cloudflared/` so root can read them:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<TUNNEL-ID>.json /etc/cloudflared/<TUNNEL-ID>.json
# point the config's credentials-file at the new location:
sudo sed -i "s|^credentials-file: .*|credentials-file: /etc/cloudflared/<TUNNEL-ID>.json|" /etc/cloudflared/config.yml
sudo chmod 600 /etc/cloudflared/<TUNNEL-ID>.json

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### 3.11 You're live

Open `https://repaircafe.yourgroup.org` in any browser — you should see the
first-run setup wizard.

---

## 4. The Cloudflare login step

`cloudflared tunnel login` prints something like:

```
Please open the following URL and log in with your Cloudflare account:

  https://dash.cloudflare.com/argotunnel?aud=&callback=...

Leave cloudflared running to download the cert automatically.
```

What to do:

1. **Copy the entire URL** (it's long — make sure you've got all of it) and
   paste it into a browser on any device. Your laptop is easiest.
2. Sign in to your Cloudflare account.
3. Pick the domain you want to use for this hub.
4. Click **Authorize**.

Cloudflare sends a `cert.pem` back to the Pi, `cloudflared` writes it to
`~/.cloudflared/cert.pem`, the command exits with success, and the install
continues.

_screenshot: cloudflare-auth.png_

If the URL has expired by the time you visit it (it's only valid for a few
minutes), `cloudflared tunnel login` is safe to re-run — it'll print a fresh
URL.

---

## 5. Verifying it works

**Container is running:**

```bash
docker compose ps
```

You want to see `Up (healthy)` for the `hub` container. The healthcheck takes
about a minute to flip from `Up (health: starting)` to `Up (healthy)`.

**Container logs:**

```bash
docker compose logs -f
```

The first run will show migrations and seed data. After that it should be
mostly quiet.

**Tunnel is connected:**

```bash
sudo systemctl status cloudflared
```

A healthy unit looks like:

```
● cloudflared.service - cloudflared
     Loaded: loaded (/etc/systemd/system/cloudflared.service; enabled; preset: enabled)
     Active: active (running) since ...
   ...
     INF Connection xxx registered connIndex=0 location=lhr
     INF Connection xxx registered connIndex=1 location=cdg
```

Two or more `Connection ... registered` lines means Cloudflare's edge has
accepted your tunnel. From here you should be able to load
`https://your-domain` from anywhere on the internet.

---

## 6. Setting a static LAN IP

The Cloudflare Tunnel doesn't care what your Pi's local IP is — that's one of
its advantages. But you'll still want a stable local IP for SSH, backups and
the inevitable day you need to reach the Pi without going through Cloudflare.

The easiest approach: **reserve the Pi's IP in your router's DHCP settings.**
Most routers have a "DHCP reservation" or "static lease" page where you map
the Pi's MAC address to a fixed IP. This is router-agnostic, survives Pi OS
upgrades, and doesn't require editing any config on the Pi itself.

Find the Pi's MAC address with:

```bash
ip link show eth0   # or wlan0 for Wi-Fi
```

The `link/ether xx:xx:xx:xx:xx:xx` value is the MAC.

---

## 7. Updating

```bash
cd ~/circularity-repair-cafe-hub
git pull
docker compose pull
docker compose up -d
```

`git pull` brings down the newest compose file and docs. `docker compose pull`
fetches the new image, which is already built, so the Pi only has to download
it. If you built your own image instead, run `./rebuild.sh` in place of the two
`docker compose` lines.

This rolls the container over with about 30 seconds of downtime. The Cloudflare Tunnel keeps running across the restart; visitors
during that 30-second window see a `502 Bad Gateway` until the new container
finishes booting. For event days, do the update the day before.

Database migrations run automatically on container start and are idempotent.

---

## 8. Troubleshooting

### Start here

```bash
cd ~/circularity-repair-cafe-hub && ./doctor.sh
```

This checks everything in one go: the machine, your settings, the container,
the database, the tunnel, your web address and whether a newer version is out.
It only reads things, so it is always safe to run. Each problem it finds comes
with what to do about it.

If you are asking for help, run it and send us everything it prints. It is the
quickest way for anyone to see what is wrong.

### Container won't start

```bash
docker compose logs
```

Most common causes:

- **Missing or short `SECRET_KEY`** — the app refuses to start if `SECRET_KEY`
  is under 32 characters. Regenerate with `openssl rand -hex 32`.
- **Postgres still initialising** — give it a minute on first run; the s6
  supervisor brings Postgres up before the Node app.
- **Out of disk space**. Check with `df -h`. The image needs about 3 GB of free
  space.
- **Could not pull the image**. Check the Pi can reach `ghcr.io`:
  `curl -fsS -o /dev/null https://ghcr.io/v2/ && echo ok`. If your network
  blocks it, build the image on the Pi instead, as shown in
  [3.4](#34-download-the-image-and-start-the-container).

### Tunnel isn't connecting

```bash
sudo journalctl -u cloudflared -n 50
```

Look for:

- `error="error parsing YAML in config file"` → syntax issue in
  `/etc/cloudflared/config.yml`. Re-read [3.9](#39-write-the-tunnel-config)
  carefully — YAML is whitespace-sensitive.
- `error="Unauthorized"` → the credentials JSON doesn't match the tunnel ID.
  Double-check both values in `config.yml`.
- `failed to dial to edge` → outbound connectivity issue. The Pi needs to
  reach Cloudflare on TCP 7844. Check your firewall.

### Domain doesn't resolve

Open your domain in Cloudflare → **DNS**. There should be a `CNAME` record
for your hostname pointing at `<TUNNEL-ID>.cfargotunnel.com`, with the **orange
cloud on**. If it's grey, click the cloud to enable proxying — Cloudflare
Tunnels require it.

### 502 Bad Gateway

The tunnel is connected but the container behind it is unreachable. Wait 30
seconds (Postgres may still be starting), then:

```bash
curl -fsS http://127.0.0.1:5026/api/health
```

You want a `{"status":"ok"}` response. If you get a connection refused, the
container isn't running — go back to [5](#5-verifying-it-works).

### Login URL won't open / "Origin Error"

If you see "Origin Error" or a 1033 page after the tunnel is supposedly up,
the tunnel is reachable but no `ingress` rule matched. Check that the
`hostname:` in `config.yml` exactly matches what you typed into your browser
and the DNS record (no trailing dot, no typo).
