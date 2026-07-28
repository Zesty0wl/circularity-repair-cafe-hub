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
hundreds of repairs, and yours to host on a £2.50/month VPS or a Pi in the
corner.

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
| Images   | Built for amd64 and arm64 by GitHub Actions, published to [GHCR](https://github.com/Zesty0wl/circularity-repair-cafe-hub/pkgs/container/circularity-repair-cafe-hub) |

## Try it first

There is a live demo, so you can see the whole thing working before you install
anything:

**<https://repaircafe.hyperspanner.net>**

| | |
| --- | --- |
| Admin | `demo@example.com` / `DemoDemo123` |
| Repairer | `repairer@example.com` / `DemoDemo123` |

Sign in as the admin to see the reports, the events, the settings and the
volunteer list. Sign in as the repairer to see the shop-floor board the way a
volunteer does on the day. Or use neither, and check an item in through the
QR-code flow the way a visitor would.

**Click anything.** Tinkerton Repair Café is invented, every repair and
volunteer in it is made up, and the whole site is wiped and rebuilt from
nothing every hour. You cannot break it in a way that lasts.

Two things are switched off, because the password is published on this page:
you cannot upload photographs, and you cannot change a password or remove an
account. Everything else works exactly as it would on your own install.

Please do not type real names, emails or phone numbers into it.

## Install

There are two ways to run this. Pick the one that matches you.

|                  | **Guided install**                                  | **Just the container**                          |
| ---------------- | --------------------------------------------------- | ----------------------------------------------- |
| What you get     | A working public website, with HTTPS                | A container listening on `127.0.0.1:5026`        |
| Who handles TLS  | Cloudflare, nothing to set up or renew              | You do, with your own reverse proxy              |
| What you need    | A domain whose nameservers point at Cloudflare      | A reverse proxy you already know how to run      |
| How long         | About five minutes, mostly waiting                  | About one minute                                 |
| Good for         | Most repair cafes                                   | People who already run servers                   |

Both use the same ready-made image, so nothing is compiled on your machine.
That is why 2 GB of memory is enough. Building the front end needs about 4 GB,
and you no longer have to do it.

## Guided install

One command takes a bare 64-bit Linux machine to a public website behind a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
There is no reverse proxy to configure, no port to forward on your router, and
no certificate to renew. It also works from behind NAT or CGNAT, which most UK
home broadband uses, so a Raspberry Pi in the corner of your venue is a
perfectly good home for it.

**Before you start you need:**

- A 64-bit Linux machine with **2 GB of memory** and 3 GB of free disk. A VPS
  or a Raspberry Pi 4 or 5 on 64-bit Raspberry Pi OS both work.
- Root access, either as `root` or as a user with `sudo`.
- A free Cloudflare account.
- A domain **whose nameservers point at Cloudflare**. Creating a Cloudflare
  account is not enough on its own. The domain has to be added to that account
  and its nameservers changed at your registrar. This is the step people get
  wrong most often, so the installer checks it before doing anything else.

**Then run:**

```bash
curl -fsSL https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/install.sh | bash
```

It asks you two things at the start: the web address you want, and where your
cafe is. Then it shows a QR code. Scan it with your phone, sign in to
Cloudflare and click Authorize. After that it runs on its own for a few
minutes and prints your website address at the end.

It is safe to re-run. It skips whatever is already done and remembers your
Cloudflare sign-in.

**To check a machine is suitable without changing anything on it:**

```bash
./install.sh --check
```

That confirms memory, disk, a free port, internet access and your domain, then
stops. It takes about ten seconds and touches nothing.

The full walk-through, including what the Cloudflare screens look like and how
to fix things when they go wrong, is in
**[docs/raspberry-pi-setup.md](./docs/raspberry-pi-setup.md)**. It is written
around a Pi, but every step applies to any machine.

## Just the container

Use this if you already have a reverse proxy, or you just want to look at the
software before committing to a domain.

You do not need the source code. The
[`docker-compose.yml`](./docker-compose.yml) stands on its own, so two files in
an empty folder are enough:

```bash
mkdir repair-cafe-hub && cd repair-cafe-hub

# 1. Get the compose file
curl -fsSL -O https://raw.githubusercontent.com/Zesty0wl/circularity-repair-cafe-hub/main/docker-compose.yml

# 2. Write a .env with a strong SECRET_KEY
printf 'SECRET_KEY=%s\n' "$(openssl rand -hex 32)" > .env

# 3. Start it
docker compose up -d
```

That file is commented throughout. It explains the port binding, the folder to
back up, and how to pin a version. If you forget the `.env`, Compose stops and
tells you what to do instead of starting a container that cannot boot.

Clone the repo instead if you also want the [documentation](./docs/README.md),
the [installer](./install.sh), [`doctor.sh`](./doctor.sh) and the sample
[`nginx.conf`](./nginx.conf) on the machine:

```bash
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub
cp .env.example .env
sed -i "s|please-change-me-32-or-more-random-chars|$(openssl rand -hex 32)|" .env
docker compose pull
docker compose up -d
```

### Set your timezone

Event times, session dates and reports all use it, so if it is wrong every time
on your site is out. It defaults to `Europe/London`. Set it to where your cafe
actually is:

```bash
echo "TZ=Europe/Berlin" >> .env
docker compose up -d
```

The guided installer does this for you from the machine's own clock.

### Reaching it before you have a domain

The container only listens on `127.0.0.1:5026`, so it is not reachable from
anywhere else. That is deliberate. To open the setup wizard from your laptop,
forward the port over SSH:

```bash
ssh -L 5026:127.0.0.1:5026 user@your-server
```

Then open <http://127.0.0.1:5026>. The forward lasts as long as the SSH session.

### Putting your own proxy in front

Point it at `127.0.0.1:5026` and forward the standard `X-Forwarded-Proto`,
`-For` and `-Host` headers. `TRUST_PROXY=true` is already set in the compose
file, so the app will issue secure cookies and rate-limit by real client IP.
Caddy, Traefik, nginx and hosted platforms all work.

### Staying on one version

By default you get `latest`, which is the newest release. To stay put until you
choose to move:

```bash
echo "HUB_VERSION=1.6.0" >> .env
docker compose up -d
```

<details>
<summary>Building the image yourself instead</summary>

You only need this if you have changed the code, or there is no published image
for your machine. 32-bit Raspberry Pi OS is the usual case, because PostgreSQL
publishes no 32-bit Arm packages.

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Or run [`./rebuild.sh`](./rebuild.sh), which does the same then tails the logs.
Building needs about 4 GB of memory. If your machine has less, add swap first,
or build somewhere bigger and copy the image over.

</details>

## Advanced: nginx + Cloudflare Origin Certificate

<details>
<summary>Click to expand, for VPS deployments or anyone who prefers a
self-managed reverse proxy</summary>

The setup used at
[`repaircafe.circularity.org`](https://repaircafe.circularity.org) is:

1. **Cloudflare** in front, with the orange cloud on, set to "Full (strict)"
   SSL. Generate a Cloudflare **Origin Certificate** for your domain, or a
   wildcard for `*.example.org`. These are trusted by Cloudflare's edge but not
   by browsers, which is exactly what you want for an origin behind Cloudflare.
2. **nginx** on your host terminating TLS with that certificate and proxying to
   the container.

A production-ready [`nginx.conf`](./nginx.conf) is included. It expects the
certificate at `/etc/ssl/certs/cloudflare/cloudflare_<name>.{pem,key}`. Edit
those paths and `server_name` for your domain, then:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/<your-domain>
sudo ln -s /etc/nginx/sites-available/<your-domain> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

</details>

## After it is running

### The first visit

Opening the site for the first time sets up the database, runs the migrations
and seeds the default skill categories, then walks you through creating your
admin account and filling in your cafe's details.

### Checking it is healthy

```bash
./doctor.sh
```

This looks at the machine, your settings, the container, the database, the
tunnel, your web address and whether a newer version is out, then says in plain
English what is fine and what is not. It only reads things, so it is always safe
to run. If you are asking for help, run it and send us everything it prints.

### Updating

```bash
git pull && docker compose pull && docker compose up -d
```

Or without a clone, just `docker compose pull && docker compose up -d`.
Migrations run automatically on start and are safe to run again. Expect about
30 seconds of downtime, so do it the day before an event rather than on the
morning.

### Backup and restore

Everything worth keeping is in the named volume
`circularity-repair-cafe-hub-data`.

```bash
# Back up the database
docker exec circularity-repair-cafe-hub \
  pg_dump -U circularity circularity > backup.sql

# Back up the uploads (photos, QR codes, branding)
docker run --rm -v circularity-repair-cafe-hub-data:/data \
  -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data uploads

# Restore the database
docker exec -i circularity-repair-cafe-hub \
  psql -U circularity -d circularity < backup.sql
```

Copy those files somewhere other than the machine they came from. A backup on
the same SD card is no backup at all.

## Documentation

Once you are up and running, the
**[user documentation in `docs/`](./docs/README.md)** walks organisers through
the whole platform: getting started, branding, skills, venues and events,
running an event day, reporting and GDPR. There is also a
[short repairer guide](./docs/repairer-guide.md) for your volunteers. The docs
live in this repo, so they always match the version you are running.

## Environment variables

| Variable        | Required | Default                                                           |
| --------------- | -------- | ----------------------------------------------------------------- |
| `SECRET_KEY`    | **yes**  | —                                                                 |
| `TZ`            | no       | `Europe/London`. Set this to where your cafe is, or every time shown on the site will be out. The installer fills it in from the machine |
| `HUB_VERSION`   | no       | `latest`. The published image tag to run, for example `1.6.0`     |
| `HUB_PORT`      | no       | `5026`. The port on the host. Change it if 5026 is already used   |
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
.github/
  workflows/ GitHub Actions: builds the amd64 + arm64 images and publishes them
nginx.conf   Production reverse-proxy config
Dockerfile   Multi-stage build (builder → s6-overlay runtime)
docker-compose.yml        Runs the published image
docker-compose.build.yml  Add-on file for building from source instead
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
