# Circularity Repair Cafe Hub

> Free, open-source software for grass-roots **repair cafes**. It is built and
> maintained as part of the [Circularity](https://circularity.org) community of
> repair groups, tool libraries and reuse hubs across the UK.

A platform that gives a repair cafe everything it needs to run an event: a
public site, check-in by QR code, a live repair queue for volunteers, a screen
for the waiting area, and an admin area with reports. Originally built for
[Circularity Repair Cafe](https://www.circularity.org/repair-cafe) and shared
with anyone who wants to run one of their own.

You can run it in two ways, with the same features in both:

- **On a free Cloudflare account**, with no server of your own. This is the
  easiest. See the [Cloudflare edition](#the-cloudflare-edition).
- **In one Docker container** on a small server or a Raspberry Pi, which
  includes its own database. See [Install with Docker](#install-with-docker).

If you run a repair cafe, or want to start one, fork it, deploy it, and change
it to suit your community. PRs welcome.

## Why?

Most repair cafes run on a clipboard, a spreadsheet and a WhatsApp group. That
works, but it doesn't scale, it loses the data that proves your impact, and it
puts a lot of admin on the volunteers. This project is the tool we wished
existed: simple enough to set up in an afternoon, capable enough to track
hundreds of repairs, and yours to host on a free Cloudflare account, a
£2.50/month VPS or a Pi in the corner.

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
- **Linux Repair Cafe** (off until you switch it on). Help people move an ageing
  computer to Linux instead of throwing it away. Microsoft stopped supporting
  Windows 10 in October 2025, so a lot of working machines are being called too
  old. Turning this on under Settings adds its own menu item, a public page you
  write yourself (heading, intro, steps, what to bring, FAQs), and a card on your
  home page explaining what it is. Linux help is an extra you offer at your normal
  sessions rather than a separate event, so you tick the sessions where it is
  available and those sessions say so on the public calendar. Volunteers can be
  marked as Linux helpers, and they are listed on the page so visitors know who
  will help them. Each computer is written up afterwards (what it was, what it ran
  before, which Linux went on, and how it went), which gives you install counts,
  a breakdown by previous system and by distribution, per-volunteer and
  per-session figures, a CSV export, and CO2 saved worked out the same way as a
  repair so the two totals can be added together. Everything is hidden while the
  feature is off, and switching it off never deletes a record. Read about the
  movement at [repaircafe.org](https://www.repaircafe.org/en/linux-repair-cafe/).
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
  fresh from the directory rather than going stale in your database. Both
  this map and the worldwide one use CARTO's free tiles, and CARTO asks every
  site to use its own free key. Paste yours under Settings, Maps; without one
  the tiles carry a watermark.
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
- **Two ways to host it.** On Cloudflare (Workers, a D1 database and R2 photo
  storage, all on the free plan), or in a single Docker container (Node 22,
  Fastify and PostgreSQL 16, with one `/data` volume for the database and
  photos). A backup from either one restores into the other.

## Stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Backend  | Node 22, Fastify 4, Drizzle ORM, PostgreSQL 16, sharp, qrcode     |
| Frontend | SvelteKit (SSR via adapter-node), Tailwind CSS, Iconify, Chart.js |
| Docker edition | Docker (multi-stage), s6-overlay, exposed on host port **5026**; Cloudflare Tunnel for public access |
| Cloudflare edition | Cloudflare Workers, D1 (SQLite), R2, Drizzle ORM, SvelteKit via adapter-cloudflare. See [apps/cloudflare](./apps/cloudflare) |
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

There are three ways to run this. Pick the one that matches you.

|                 | **Cloudflare edition**                     | **Docker: guided install**                     | **Docker: just the container**             |
| --------------- | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------ |
| Where it runs   | Your free Cloudflare account               | Your own Linux machine or Raspberry Pi         | Your own machine                           |
| What you look after | Nothing. No server, no disk, no patches | The machine, its updates and its disk          | The machine and your own reverse proxy     |
| What you need   | A Cloudflare account and a laptop with Node.js, for setup and updates | A domain on Cloudflare, and a machine with 2 GB of memory | A reverse proxy you already know how to run |
| How long        | About ten minutes                          | About five minutes, mostly waiting             | About one minute                           |
| Good for        | Most repair cafes                          | Cafes that want the data on their own machine  | People who already run servers             |

All three have every feature. A backup from one restores into the others, so
you can change your mind later. See
[moving between Docker and Cloudflare](./docs/cloudflare/MIGRATION.md).

## The Cloudflare edition

The whole hub runs on Cloudflare's free plan: the website and API on Workers,
the database on D1, and photos on R2. There is nothing to install on a machine
of your own, and nothing to keep running. Your laptop is only needed to set it
up and to update it.

**Before you start you need:**

- A free Cloudflare account, with **R2 Object Storage** switched on once in
  the dashboard. It is free for what a cafe uses, but Cloudflare may ask for
  card details.
- A domain whose nameservers point at Cloudflare. You can skip this while you
  try it: every hub also gets a free `workers.dev` address.
- [Node.js](https://nodejs.org) 22 or newer and [Git](https://git-scm.com) on
  your laptop (Windows, Mac or Linux).

**Then run these, one at a time:**

```bash
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub
npm install -g pnpm
pnpm install
pnpm --filter @circularity/cloudflare exec wrangler login
pnpm cf:deploy -- --domain repair.example.org
```

The `wrangler login` step opens your browser so you can allow access. The last
step creates the database and photo storage, builds the site and publishes it
at your address, with an HTTPS certificate. It takes two or three minutes.
Then open your address, and the setup wizard starts.

**To update it later**, from the same folder:

```bash
git pull
pnpm install
pnpm cf:deploy
```

The full guide covers settings, backups, the free plan's limits and what to do
when something goes wrong:
**[docs/cloudflare/README.md](./docs/cloudflare/README.md)**.

## Install with Docker

The two Docker options use the same ready-made image, so nothing is compiled
on your machine. That is why 2 GB of memory is enough. Building the front end
needs about 4 GB, and you no longer have to do it.

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

On Docker:

```bash
./doctor.sh
```

This looks at the machine, your settings, the container, the database, the
tunnel, your web address and whether a newer version is out, then says in plain
English what is fine and what is not. It only reads things, so it is always safe
to run. If you are asking for help, run it and send us everything it prints.

On Cloudflare, `pnpm --filter @circularity/cloudflare exec wrangler tail`
shows each request as it happens, with any errors.

### Updating

On the Cloudflare edition, run `git pull`, `pnpm install` and `pnpm cf:deploy`
from the folder you set it up in. The site stays up while it updates.

On Docker:

```bash
cd ~/circularity-repair-cafe-hub
git pull            # leave this out if you only have a docker-compose.yml
docker compose pull
docker compose up -d
```

Your data lives in a separate volume, so nothing is lost. Migrations run
automatically on start and are safe to run again. Expect about 30 seconds of
downtime, so do it the day before an event rather than on the morning. Run
`./doctor.sh` afterwards to check everything came back.

The same instructions are in the app itself, under **Settings → About**.

**You will be told when there is one.** Once a day the hub asks GitHub which
versions have been released, and the admin area shows a line when a newer one
exists. It never updates itself: someone has to pick the moment, because it
restarts the site.

That check sends nothing about your cafe. No version, no counts, no identifier.
It is an ordinary request for a public page, so GitHub sees an IP address and
nothing else, the same as if you visited the repository in a browser. To switch
it off completely, so no request is ever made, set `UPDATE_CHECK_DISABLED=true`
in your `.env`. The admin page will then say the check is off rather than
implying you are up to date.

### Backup and restore

The easiest way works on both editions. Sign in as a super admin, go to
**Settings, Backup & restore**, and choose **Download backup zip**. The zip
holds every table and every photo, and restores into either edition from the
same page.

On Docker you can also back up from the command line. Everything worth keeping
is in the named volume `circularity-repair-cafe-hub-data`.

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

These are for the Docker edition, in your `.env` file. The Cloudflare edition
uses the same names as Worker variables. See
[its settings](./docs/cloudflare/README.md#settings).

| Variable        | Required | Default                                                           |
| --------------- | -------- | ----------------------------------------------------------------- |
| `SECRET_KEY`    | **yes**  | None. Make one with `openssl rand -hex 32`                        |
| `TZ`            | no       | `Europe/London`. Set this to where your cafe is, or every time shown on the site will be out. The installer fills it in from the machine |
| `HUB_VERSION`   | no       | `latest`. The published image tag to run, for example `1.6.0`     |
| `HUB_PORT`      | no       | `5026`. The port on the host. Change it if 5026 is already used   |
| `UPDATE_CHECK_DISABLED` | no | `false`. Set `true` to never ask GitHub about new versions        |
| `DATABASE_URL`  | no       | `postgresql://circularity:circularity@127.0.0.1:5432/circularity` |
| `PORT`          | no       | `3000` (mapped to host `5026` by the included compose file)       |
| `UPLOADS_DIR`   | no       | `/data/uploads`                                                   |
| `TRUST_PROXY`   | no       | `false`. Set `true` when running behind a reverse proxy           |

## Repository layout

```
apps/
  server/      Fastify backend, Drizzle migrations, REST API (Docker edition)
  cloudflare/  The same API on Cloudflare Workers, D1 and R2 (Cloudflare edition)
  web/         SvelteKit app, built with adapter-node or adapter-cloudflare
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

The codebase is a pnpm workspace. The Docker image is built entirely inside
Docker, so a Docker host needs no Node toolchain. To work on the code locally:

```bash
pnpm install
pnpm dev:server   # Docker edition's backend at :3000
pnpm dev:web      # SvelteKit dev server
pnpm cf:dev       # the Cloudflare edition at :8787, with a local database
pnpm cf:test      # the Cloudflare edition's tests, in the real Workers runtime
```

Both editions serve the same web app and the same API. A change to one API
route usually needs the same change in `apps/server` and `apps/cloudflare`.
[docs/cloudflare/PLAN.md](./docs/cloudflare/PLAN.md) explains how the
Cloudflare edition is put together.

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
