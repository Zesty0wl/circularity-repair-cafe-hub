# Running the hub on Cloudflare: the plan

Status: built, and in use. How to set it up is in [README.md](./README.md).

## Why

Today a cafe needs a machine that runs Docker: a VPS, or a Raspberry Pi in a
cupboard. Most cafes do not have one, and do not have anybody who wants to look
after one. Cloudflare's free plan can run the whole hub with no machine at all.
There is nothing to patch, nothing to back up by hand, and no disk to fill up.

The goal is the same hub, with every feature, running on a free Cloudflare
account with the cafe's own domain.

## What we found

The hub is two programs in one container, plus a database:

| Part                    | Today                                               |
| ----------------------- | --------------------------------------------------- |
| Web pages               | SvelteKit, server-rendered with `adapter-node`      |
| API                     | Fastify 4, 134 routes, Drizzle ORM                  |
| Database                | PostgreSQL 16 inside the container                  |
| Photos and branding     | Files on the `/data` volume, resized with `sharp`   |
| Sharing pictures, icons | SVG drawn to PNG with `sharp`, cached on disk       |
| Passwords               | `bcrypt`, cost 12                                   |
| Login tokens            | JWT (15 minutes) plus a refresh cookie (365 days)   |
| Daily jobs              | `setInterval` in the Node process (telemetry)       |
| Caches                  | Memory, and JSON files on disk                      |
| Backups                 | `pg_dump` plus the uploads folder, in one zip       |

The web app is already well separated from the server. Every page gets its
data by calling `/api/...`, and nothing in the web app knows about Postgres.
That makes the port much smaller than it looks.

## The limits that shape the design

Cloudflare's free plan, as of October 2026:

| Limit                          | Free plan                         | What it means for us                      |
| ------------------------------ | --------------------------------- | ----------------------------------------- |
| Requests                       | 100,000 a day                     | Far more than any cafe uses               |
| CPU time per request           | 10 ms                             | The hard one. See below                   |
| Worker size                    | 3 MB after compression            | No `sharp`, careful with WebAssembly      |
| D1 (database)                  | 5 GB, 5M rows read and 100k written a day | Plenty                              |
| D1 query                       | At most 100 bound values          | Big inserts must be split up              |
| R2 (files)                     | 10 GB, 1M writes and 10M reads a month | Thousands of photos                  |
| Cron triggers                  | 5 per account                     | We use none (see below)                   |
| Outbound requests              | 50 per request                    | Fine                                      |

**CPU time.** We measured this on the target account. A request that uses
400 ms of CPU (one bcrypt check at cost 12) succeeds now and then. Fifteen of
them in a row start to fail with error 503. So the rule is: everyday requests
must be light, and heavy work must be rare and cached. That rules out:

- resizing photos on the server (the browser does it now),
- checking bcrypt on every login (we change to PBKDF2, which is built in),
- drawing a sharing picture on every request (we draw once and keep it).

## The new shape

One Cloudflare Worker serves everything at the cafe's own address.

```
            browser
               │
     ┌─────────▼──────────┐   static files (/_app, fonts, images):
     │  Cloudflare edge   │── served directly, no CPU used
     └─────────┬──────────┘
               │ everything else
     ┌─────────▼──────────────────────────────────────────┐
     │  Worker  (apps/cloudflare/src/worker.ts)            │
     │                                                     │
     │  /api/*, /uploads/*, /og/*, /icons/*, robots.txt,   │
     │  sitemap.xml, manifest  ──►  the API (src/app.ts)   │
     │                                                     │
     │  every other page       ──►  SvelteKit SSR          │
     │         (its calls to /api go straight to the       │
     │          API in the same process)                   │
     │                                                     │
     │  after a visit, hourly  ──►  scheduled jobs         │
     └──────┬────────────────────────────┬─────────────────┘
            │                            │
       ┌────▼────┐                  ┌────▼────┐
       │   D1    │  the database    │   R2    │  photos, branding,
       └─────────┘                  └─────────┘  QR codes, caches
```

### Part by part

| Today                          | On Cloudflare                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Fastify routes                 | The same routes, with the same paths and the same JSON, on a small router with Fastify's shape (`lib/router.ts`), so the route code barely changes and the web app not at all |
| PostgreSQL                     | D1, which is SQLite. Drizzle has a SQLite mode, so most queries carry over   |
| `pg` raw SQL                   | Rewritten for SQLite. `FILTER (WHERE ...)` works in SQLite. `::int`, `INTERVAL`, `to_char` and `EXTRACT` do not |
| Postgres types                 | `uuid` → text, `jsonb` → JSON text, `text[]` → JSON text, `timestamptz` → whole milliseconds, `numeric` → real, enums → text |
| Migrations on start            | The same idea: numbered SQL files run on the first request after a deploy, and are recorded so they run once |
| `/data/uploads`                | An R2 bucket, served at the same `/uploads/...` addresses                    |
| `sharp` resizing               | The browser shrinks and re-encodes every photo before it uploads it. The server checks the file really is a picture and strips JPEG metadata |
| `sharp` sharing pictures       | [resvg](https://github.com/yisibl/resvg-js) compiled to WebAssembly (about 0.95 MB compressed). Each picture is drawn once and kept in R2 under a hash of what it shows, exactly like the disk cache today |
| `bcrypt`                       | PBKDF2-SHA256 with 100,000 rounds, built into the Worker. Imported bcrypt hashes are checked once, at that person's next login, and replaced |
| `@fastify/jwt`                 | Signed with the Web Crypto API, same claims, same lifetimes                  |
| `SECRET_KEY` in `.env`         | A Worker secret if you set one. If you do not, the hub makes one on first run and keeps it in the database, so there is one fewer step |
| `@fastify/rate-limit`          | A small D1 table of recent failed logins                                     |
| `helmet`                       | The same headers, set by the Worker                                          |
| `setInterval` telemetry        | Hourly jobs that run after a visit, and send only when a send is due. The free plan allows only five cron triggers per account, and an account may have used them already (`src/housekeeping.ts`) |
| Disk caches (directory, update check) | R2 objects, refreshed by the same hourly jobs                          |
| Memory cache (iFixit)          | Cloudflare's cache, plus memory while the Worker is warm                     |
| `pg_dump` backups              | The browser builds the zip: it asks for the data as JSON and fetches each file. The Worker never holds a whole backup in memory |
| `TZ` environment variable      | A `TZ` setting on the Worker, used wherever "today" matters                  |
| `DEMO_MODE` and other switches | Worker variables with the same names                                         |
| Cloudflare Tunnel + Pi         | Not needed. The Worker answers on the cafe's own domain                      |

### What stays the same

- Every page, every feature, every route, every response shape.
- The look of the site and the admin area.
- The telemetry rules: nothing is sent until somebody says yes, and only counts
  are ever sent.
- Demo mode: no uploads, no password changes, no telemetry.

### What changes for people

- **Volunteers and visitors:** nothing.
- **Admins:** photo uploads are shrunk in the browser before they are sent, so
  they are faster on a hall's wifi. Backups are built in the browser, so the
  tab must stay open while one downloads.
- **Whoever sets it up:** no machine, no Docker, no tunnel. A Cloudflare
  account, a domain on Cloudflare, and one command.
- **Updates:** run the deploy command again. Database changes apply themselves.

## Where the code goes

```
apps/
  server/        the Docker API, unchanged apart from the migration work
  web/           the SvelteKit app, shared by both. Builds for Node by default,
                 and for Cloudflare when HUB_TARGET=cloudflare
  cloudflare/    new
    src/
      worker.ts         the Worker entry: routing, headers, page cache, hourly jobs
      app.ts            every API route, registered as in apps/server
      routes/           the routes, one file per area, as in apps/server
      services/         ports of apps/server/src/services
      lib/              the router, crypto, pictures, dates, caching
      db/schema.ts      the Drizzle SQLite schema
      db/migrations/    numbered SQL migrations
    test/               tests that run in the real Workers runtime
    wrangler.jsonc
packages/
  shared/        unchanged
```

Pure logic with no Node or Postgres in it (the CO2 reference data and matching,
recurring event rules, the default page wording) is imported from `apps/server`
rather than copied. The backup format lives in `packages/shared`.

The web app learns one new thing: during server rendering on Cloudflare, its
calls to `/api` are handed straight to the API in the same Worker, instead of
going out over the network and back.

## Testing

1. **Unit tests** for the new pieces with no equivalent today: password
   hashing and upgrade, tokens, the picture checks, and the reader for Docker
   backups.
2. **Integration tests** that run in `workerd`, the real Worker runtime, with
   a local D1 and R2. They walk through a whole session: set up the cafe, sign
   in, add a venue and a session, open it, check in an item with a photo,
   accept it, finish it, read the reports, export a backup and import it.
3. **Both builds** of the web app, and `svelte-check`.
4. **A live test site** on a Cloudflare account, checked in
   a real browser: public pages, setup, admin, the board, check-in by phone.
5. **A real migration**: a backup taken from a running Docker hub, imported
   into the Cloudflare one, and compared.

## Moving an existing cafe across (phase 3)

The full design is in [MIGRATION.md](./MIGRATION.md). In short:

1. Set up the Cloudflare hub. Do not finish the setup wizard.
2. On the Docker hub, download a backup, as today (Settings, Backup).
3. On the new hub's first page, choose "Move from an existing hub" and pick
   that file. The browser reads it, sends the data in small batches and
   uploads each photo, and shows progress as it goes.
4. Check the new site, then point the domain at it.

The Cloudflare hub reads the Docker backup format that already exists, so the
two cafes do not have to upgrade their Docker hub first. Nobody has to reset a
password: old passwords keep working and are upgraded quietly at the next
login.

## Risks and what we do about them

| Risk                                              | What we do                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| A busy page goes over the CPU limit               | Keep queries few, cache the cafe profile while warm, measure on the live site |
| The Worker grows past 3 MB                        | Check the size on every build. resvg is the biggest piece at about 0.95 MB  |
| SQL that means something different in SQLite      | Integration tests compare totals, counts and dates                          |
| D1's limit of 100 values per query                | Insert in small groups, and use `json_each` instead of long `IN (...)` lists |
| D1 has no long-running transactions               | Use D1 batches, which run as one transaction                                |
| An old bcrypt hash is slow to check               | It happens once per person, then the hash is replaced                       |
| A very large backup                               | The browser sends it in pieces, so size is limited by R2, not the Worker    |
