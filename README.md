# Circularity Repair Cafe Hub

> Free, open-source software for grass-roots **repair cafes** — built and maintained
> as part of the [Circularity](https://circularity.org) community of repair groups,
> tool libraries and reuse hubs across the UK.

A self-hosted platform that gives a repair cafe everything it needs to run an
event: a public site, customer self-check-in via QR code, a live job-queue board
for repairers, an admin area with reports, and a single Docker container that
includes its own database. Originally built for
[Circularity Repair Cafe](https://www.circularity.org/repair-cafe) and shared
with anyone who wants to run one of their own.

If you run a repair cafe — or want to start one — fork it, deploy it, change it
to suit your community. PRs welcome.

## Why?

Most repair cafes run on a clipboard, a spreadsheet and a WhatsApp group. That
works, but it doesn't scale, it loses the data that proves your impact, and it
puts a lot of admin on the volunteers. This project is the tool we wished
existed: simple enough to set up in an afternoon, capable enough to track
hundreds of repairs, and yours to host on a £5/month VPS or a Pi in the corner.

## Features

- **Public site** with a configurable home page, photo gallery, upcoming events,
  team profiles, FAQs and your branding (logo, banner, favicon, primary colour).
- **QR-code check-in** — a printable per-event poster; customers scan with their
  phone, walk through a 4-step submission flow with a "before" photo.
- **Live shop-floor board** — full-screen kiosk view of the queue, with auto-paging
  and live timers. Repairers accept jobs, log notes, parts, environmental savings
  and after photos.
- **Admin** — events (one-off and recurring), venues, skill categories, repairers,
  full repair history, CSV export, statistics dashboard.
- **SEO + analytics** — server-rendered Open Graph / Twitter tags so previews work
  in Facebook / LinkedIn / Slack, optional [Plausible](https://plausible.io)
  integration, configurable favicon and meta description — all from the admin UI.
- **Privacy by design** — bcrypt passwords, JWT + httpOnly refresh cookies,
  rate-limited login, CSP headers, configurable PII retention with auto-purge.
- **Single container** — Node 22 + Fastify + PostgreSQL 16, supervised by
  s6-overlay; one `/data` volume for the database, uploads and QR codes.

## Stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Backend  | Node 22, Fastify 4, Drizzle ORM, PostgreSQL 16, sharp, qrcode     |
| Frontend | SvelteKit (SPA via adapter-static), Tailwind CSS, Iconify, Chart.js |
| Infra    | Docker (multi-stage), s6-overlay, exposed on host port **5026**   |

## Quick start (Docker)

You'll need a Linux host (a small VPS, a home server, or a Raspberry Pi 4/5
works well) with Docker and Docker Compose v2 installed. Everything else lives
inside the container.

```bash
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub

# 1. Generate a strong SECRET_KEY (used to sign auth tokens)
cp .env.example .env
sed -i "s|please-change-me-32-or-more-random-chars|$(openssl rand -hex 32)|" .env

# 2. Build and start
docker compose up -d --build
```

By default the container only listens on `127.0.0.1:5026` on the server. To
**open the setup wizard from your laptop**, you have two options:

**Option A — quick: SSH tunnel** (great for trying it out before setting up
a domain). On your Windows / Mac / Linux laptop, run:

```bash
ssh -L 5026:127.0.0.1:5026 user@your-server
```

Then open <http://127.0.0.1:5026> in your browser. The tunnel stays open as
long as the SSH session is.

**Option B — production: a public hostname behind a reverse proxy.** This is
the recommended setup for anything you actually want to use on event day —
see ["Deploying behind Cloudflare + nginx"](#deploying-behind-cloudflare--nginx)
below.

The first request bootstraps the database, runs migrations, seeds the default
skill categories, then walks you through creating the super-admin account and
filling in your cafe details.

To upgrade later, `git pull && docker compose up -d --build`. Migrations are
idempotent and run automatically on container start.

## Deploying behind Cloudflare + nginx

The container intentionally only listens on `127.0.0.1:5026` — it's designed to
sit behind a reverse proxy for TLS, HTTP/2 and any host-level rate-limiting you
want. The recommended setup (and the one used at
[`repaircafe.circularity.org`](https://repaircafe.circularity.org)) is:

1. **Cloudflare** in front, with the orange cloud on, set to "Full (strict)" SSL.
   Generate a Cloudflare **Origin Certificate** for your domain (or a wildcard
   for `*.example.org`) — these certs are trusted by Cloudflare's edge but not
   by browsers, which is exactly what you want for an origin behind Cloudflare.
2. **nginx** on your host terminating TLS using that origin cert and proxying
   to the container.

A production-ready [`nginx.conf`](./nginx.conf) is included. It expects the
Cloudflare cert at `/etc/ssl/certs/cloudflare/cloudflare_<name>.{pem,key}` —
edit those paths and `server_name` for your domain, then:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/<your-domain>
sudo ln -s /etc/nginx/sites-available/<your-domain> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The proxy forwards `X-Forwarded-Proto` / `-For` / `-Host`. Because
`TRUST_PROXY=true` is set in [`docker-compose.yml`](./docker-compose.yml), the
app issues secure cookies and rate-limits per real client IP correctly.

> Cloudflare not your style? Any other reverse proxy works — Caddy, Traefik,
> a hosted PaaS, etc. The only requirement is the proxy forwards the standard
> `X-Forwarded-*` headers.

## Backup & restore

Everything persists in the named volume `circularity-repair-cafe-hub-data`.

```bash
# Backup the Postgres database
docker exec circularity-repair-cafe-hub \
  pg_dump -U circularity circularity > backup.sql

# Backup the uploads (photos, QR codes, branding)
docker run --rm -v circularity-repair-cafe-hub-data:/data \
  -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data uploads

# Restore the database
docker exec -i circularity-repair-cafe-hub \
  psql -U circularity -d circularity < backup.sql
```

## Environment variables

| Variable        | Required | Default                                                           |
| --------------- | -------- | ----------------------------------------------------------------- |
| `SECRET_KEY`    | **yes**  | —                                                                 |
| `TZ`            | no       | `Europe/London`                                                   |
| `DATABASE_URL`  | no       | `postgresql://circularity:circularity@127.0.0.1:5432/circularity` |
| `PORT`          | no       | `3000` (mapped to host `5026` by the included compose file)       |
| `UPLOADS_DIR`   | no       | `/data/uploads`                                                   |
| `TRUST_PROXY`   | no       | `false` — set `true` when running behind a reverse proxy          |

## Repository layout

```
apps/
  server/    Fastify backend, Drizzle migrations, REST API
  web/       SvelteKit SPA (adapter-static)
packages/
  shared/    Shared Zod schemas / TypeScript types
docker/      cont-init scripts and s6-rc service definitions
nginx.conf   Production reverse-proxy config
Dockerfile   Multi-stage build (builder → s6-overlay runtime)
```

## Development

The codebase is a pnpm workspace, but the production build runs entirely inside
the Docker image — you don't need a Node toolchain on the host to deploy. To
hack on the code locally:

```bash
pnpm install
pnpm dev:server   # backend at :3000
pnpm dev:web      # SvelteKit dev server
```

## Contributing

This is a community project for the Circularity network and anyone else who'd
benefit. Issues, feature ideas and PRs are all welcome — see the
[issue tracker](https://github.com/Zesty0wl/circularity-repair-cafe-hub/issues).

A few things on the backlog right now:

- Camera capture on iOS Safari sometimes shows a black square — investigating.
- Customers can't yet edit a job they just submitted; planned via localStorage
  so the check-in URL remembers their submission.

## License

[MIT](./LICENSE) — free for any community group, repair cafe, library, charity
or business to use, modify and distribute. Attribution to
[Circularity](https://circularity.org) is appreciated but not required.
