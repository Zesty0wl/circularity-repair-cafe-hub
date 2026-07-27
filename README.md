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
- **Session photo galleries** — every event has its own gallery. Repairers and
  admins add photos from a phone or a laptop by drag and drop, paste or browse;
  big photos are shrunk in the browser first. Photos of the session go public
  straight away, while photos taken during a repair stay private until an admin
  chooses to show them. Star any photo to bring it into the main gallery on the
  home page. Past events also show what happened at the session (items in, items
  fixed, categories, volunteers, waste saved) with no visitor details.
- **Carbon savings that add up** — visitors say what kind of thing they have brought,
  and the CO2 saved is looked up from
  [The Restart Project's reference data](https://zenodo.org/records/5900046) rather
  than estimated by a volunteer. A public About page shows the sum, worked examples,
  and what share of repairs the total covers.
- **Repair guides** — search thousands of step-by-step guides from the
  [iFixit API](https://www.ifixit.com/api-docs), with photographs, tools, parts and
  numbered steps rendered in your own site's style. The server proxies and caches
  the API, so visitors' searches stay between them and you. Guide text and photos
  are iFixit's, shared under CC BY-NC-SA, and every guide links back to the original.
- **Worldwide map** — a flat map of every Repair Café in the world, drawn from the
  [repaircafe.org location API](https://www.repaircafe.org/en/api/). The server
  mirrors the directory once a day and drops the contact email addresses before
  passing it on, so the browser makes one same-origin request for the data. Cafés
  that sit close together are grouped into one numbered circle; clicking it zooms
  in and splits it up, with the grouping worked out by Supercluster before the map
  sees anything, so only the markers in view are ever drawn. The map is Leaflet
  over a dark OpenStreetMap style served by CARTO. Set your own repaircafe.org
  page under Settings and your cafe is marked on the map. The page also links to
  the shared figures at the telemetry collector, so visitors can see how many
  other cafés run this software.
- **Local cafe community** — pick up to ten nearby Repair Cafes out of the
  repaircafe.org directory under Settings, searching by name or town with your
  closest neighbours listed first. They show on the home page as a flat map
  (Leaflet over CARTO tiles) beside a numbered list, where a pin and a list row
  point at each other, and each cafe links to its own site. Only the
  repaircafe.org slug is stored, so names, addresses and pins are always read
  fresh from the directory rather than going stale in your database.
- **SEO + analytics** — every public page is server-rendered with Open Graph /
  Twitter tags and schema.org structured data, plus an auto-generated sitemap.
  Previews work in Facebook / LinkedIn / Slack and events can surface as rich
  results. Sharing pictures are drawn per section in your own brand colours, so
  every link does not look the same: an event shows its date and venue, while
  repair guides and volunteer pages use their own photograph.
  Optional [Plausible](https://plausible.io) integration; configurable
  favicon and meta description — all from the admin UI.
- **Optional, honest telemetry** — your hub can send the project a daily summary
  of counts (repairs, sessions, version) so we can show what community repair
  achieves across every cafe running this. The setup wizard asks, shows you the
  real message before you agree, and nothing is ever sent until you say yes.
  There is no free-text field in the message at all, so no item description,
  note, visitor or volunteer can travel with it. Turn it off in Settings, or
  rule it out for the whole install with `TELEMETRY_DISABLED=true`. The
  collector that receives it is a separate, equally open project:
  [circularity-repair-cafe-collector](https://github.com/Zesty0wl/circularity-repair-cafe-collector).
  What gets sent and why is set out in [`docs/proposal-telemetry.md`](./docs/proposal-telemetry.md).
- **Privacy by design** — bcrypt passwords, JWT + httpOnly refresh cookies,
  rate-limited login, CSP headers, configurable PII retention with one-click purge.
- **Single container** — Node 22 + Fastify + PostgreSQL 16, supervised by
  s6-overlay; one `/data` volume for the database, uploads and QR codes.

## Stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Backend  | Node 22, Fastify 4, Drizzle ORM, PostgreSQL 16, sharp, qrcode     |
| Frontend | SvelteKit (SSR via adapter-node), Tailwind CSS, Iconify, Chart.js |
| Infra    | Docker (multi-stage), s6-overlay, exposed on host port **5026**; Cloudflare Tunnel for public access |

## Quick start (Docker)

> **Deploying to a Raspberry Pi for real use?** Skip this section and follow
> the [**Raspberry Pi setup guide**](./docs/raspberry-pi-setup.md) — it
> wraps everything below plus a Cloudflare Tunnel into a single
> [`install.sh`](./install.sh) you can run on a fresh Pi.

The steps below are for trying the app out on any Linux host with Docker and
Docker Compose v2 installed. Everything else lives inside the container.

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

**Option B — production with a real domain.** Pick one of the deployment
paths below:

- **[Deploying to a Raspberry Pi (recommended)](#deploying-to-a-raspberry-pi-recommended)**
  — Pi + Cloudflare Tunnel, no reverse proxy or certificates to manage.
- **[Advanced: nginx + Cloudflare Origin Certificate](#advanced-nginx--cloudflare-origin-certificate)**
  — for VPS or static-IP servers where you want full control.

The first request bootstraps the database, runs migrations, seeds the default
skill categories, then walks you through creating the super-admin account and
filling in your cafe details.

To upgrade later, `git pull && docker compose up -d --build`. Migrations are
idempotent and run automatically on container start.

## Documentation

Once you're up and running, the **[user documentation in `docs/`](./docs/README.md)**
walks repair cafe organisers through the whole platform — getting started,
branding, skills, venues & events, running an event day, reporting and GDPR.
There's also a [short repairer guide](./docs/repairer-guide.md) for your
volunteers. The docs live in this repo so they always match the version of the
software you're running.

## Deploying to a Raspberry Pi (recommended)

The simplest production setup is a Pi 4 or 5 in the corner of your venue (or
your house) running this container behind a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
There's no nginx to configure, no port to forward on the router, no TLS
certificate to renew — Cloudflare's edge handles all of it, and the tunnel
works from behind NAT / CGNAT (common on UK home broadband).

From a fresh Raspberry Pi OS Lite 64-bit install:

```bash
curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh | bash
```

The full step-by-step guide — including prerequisites, the Cloudflare login
flow, verification, updates and troubleshooting — is in
**[docs/raspberry-pi-setup.md](./docs/raspberry-pi-setup.md)**.

The only thing you need before you start is a Cloudflare account with your
domain added (the free plan is fine) and proxying turned on for that domain.

## Advanced: nginx + Cloudflare Origin Certificate

<details>
<summary>Click to expand — for VPS deployments or anyone who prefers a
self-managed reverse proxy</summary>

The container intentionally only listens on `127.0.0.1:5026` — it's designed to
sit behind a reverse proxy for TLS, HTTP/2 and any host-level rate-limiting you
want. The original setup (and the one used at
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

</details>

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
  web/       SvelteKit app (server-rendered via adapter-node)
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
