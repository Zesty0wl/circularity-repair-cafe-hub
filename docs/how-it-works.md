# How the hub works

This page is for people who want to change the code. To install a hub, see
[install.md](./install.md).

## The shape

One Cloudflare Worker serves everything at the cafe's own address.

```
            browser
               │
     ┌─────────▼──────────┐   static files (/_app, fonts, images):
     │  Cloudflare edge   │── served directly, no Worker time used
     └─────────┬──────────┘
               │ everything else
     ┌─────────▼──────────────────────────────────────────┐
     │  Worker  (apps/cloudflare/src/worker.ts)            │
     │                                                     │
     │  /api/*, /uploads/*, /og/*, /icons/*, robots.txt,   │
     │  sitemap.xml, manifest  ──►  the API (src/app.ts)   │
     │                                                     │
     │  every other page       ──►  SvelteKit, drawn on    │
     │                              the server. Its calls  │
     │                              to /api go straight to │
     │                              the API in the same    │
     │                              Worker                 │
     │                                                     │
     │  after a visit, hourly  ──►  background jobs        │
     └──────┬────────────────────────────┬─────────────────┘
            │                            │
       ┌────▼────┐                  ┌────▼────┐
       │   D1    │  the database    │   R2    │  photos, branding,
       └─────────┘  (SQLite)        └─────────┘  QR codes, caches
```

## Where the code is

```
apps/
  web/           the website and admin area: SvelteKit, built with
                 adapter-cloudflare. Pages get all their data from /api.
  cloudflare/    the Worker
    src/
      worker.ts         the entry: routing, security headers, page cache
      app.ts            every API route, registered in one place
      routes/           the routes, one file per area
      services/         the work behind the routes (QR codes, telemetry, ...)
      lib/              the router, crypto, pictures, dates, caching
      db/schema.ts      the Drizzle schema for D1
      db/migrations/    numbered SQL migrations
      housekeeping.ts   the hourly jobs, run after a visit
    test/               tests that run in workerd, the real Workers runtime
    wrangler.jsonc      the Worker's configuration
packages/
  shared/        types, validation and the backup format, used by both apps
demo/            the public demo's seed script and photographs
docs/            the documentation
```

## The limits that shape the design

Cloudflare's free plan allows each request about **10 milliseconds of CPU
time**. Short bursts over it are tolerated, but steady heavy work fails with
a 503. So everyday requests are light, and heavy work is rare and cached:

| Heavy work | How the hub avoids it |
| --- | --- |
| Resizing photos | The browser shrinks and re-encodes every photo before upload (`apps/web/src/lib/imagePrep.ts`). The Worker only checks the file is a real picture and strips its metadata (`lib/images.ts`). |
| Hashing passwords | PBKDF2-SHA256 with Web Crypto, which is built in. Passwords from old Docker hubs are bcrypt, checked once at the next sign-in and then replaced. |
| Drawing social media pictures | resvg, compiled to WebAssembly. Each picture is drawn once and kept in R2 under a hash of what it shows. |
| Drawing public pages | Kept in Cloudflare's cache for 60 seconds for visitors who are not signed in. |
| Building and reading backups | Done in the browser (`apps/web/src/lib/backup/`). The Worker hands over data a table at a time and takes it back in batches. |

Other limits:

- **The Worker must stay under 3 MB** after compression. resvg is the biggest
  part, at about 0.95 MB.
- **A D1 query takes at most 100 bound values**, so large inserts are split
  into small groups.
- **Five cron triggers per account.** The hub uses none: its hourly jobs run in
  the background after a request (`src/housekeeping.ts`), and one SQL statement
  claims each run so two Worker instances never both run it.
- **A Worker has no lasting memory.** Anything kept in memory (such as "setup
  is finished", or the signing key) lasts only as long as that instance, and
  some of it expires after a few seconds, because another instance may have
  changed the data.

## Database

D1 is SQLite. The schema is in `db/schema.ts`. Times are stored as whole
milliseconds, lists and objects as JSON text, and ids as text UUIDs.

Migrations are numbered files in `db/migrations/`. The first request after a
publish runs any that are new, and records them so they run once. Then
`seed()` fills in what a new hub needs: the empty cafe row, the default skill
categories and the CO2 reference figures.

## Sign-in

An access token (a JWT signed with Web Crypto) lasts 15 minutes. A refresh
cookie lasts a year and gets a new access token when needed. The signing key
is the `SECRET_KEY` secret if there is one. If not, the hub makes a random key
on first run and keeps it in the `hub_meta` table. Failed sign-ins are counted
in the `login_attempts` table, ten per address and email in ten minutes.

## Demo mode

`DEMO_MODE=true` turns a hub into a public try-it-out site: no uploads, no
password changes, no imports, no telemetry, and no search engines. The whole
policy is in `plugins/demoMode.ts`. The public demo is reset every hour by
`demo/seed.py`, using a secret key that lets it past those rules
(`routes/demo.ts`). See [demo.md](./demo.md).

## Working on the code

```
pnpm install
pnpm cf:test      # the tests, in the real Workers runtime
pnpm cf:dev       # the whole hub on your computer at http://localhost:8787
pnpm dev:web      # the website with instant reloads at http://localhost:5173,
                  # talking to the hub from cf:dev
```

`pnpm cf:dev` uses a local database in `apps/cloudflare/.wrangler`. To fill it
with the demo cafe, run `python3 demo/seed.py` while it is running.

Every pull request runs the tests, the type check and a full build
(`.github/workflows/ci.yml`).
