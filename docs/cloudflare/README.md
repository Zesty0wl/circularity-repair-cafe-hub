# The Cloudflare edition

The Cloudflare edition is the same hub, with every feature, running on a free
Cloudflare account instead of a machine of your own. There is no server to
look after, nothing to patch, and no disk to fill up.

It is new. [Repair Café Woodville](https://repaircafe.circularity.org) moved
to it from Docker in October 2026, and runs on it now.

- How it works, and why it is built this way: [PLAN.md](./PLAN.md)
- Moving an existing Docker hub across, and back: [MIGRATION.md](./MIGRATION.md)

## What you need

- A free Cloudflare account.
- A domain whose nameservers point at Cloudflare. This is the same as for the
  Docker edition's guided install. You can skip it while you try things out:
  every hub also gets a free `workers.dev` address.
- A computer with [Node.js](https://nodejs.org) 22 or newer and
  [Git](https://git-scm.com), for the first setup and for updates. Any
  Windows, Mac or Linux laptop will do. Nothing runs on it afterwards.

You do **not** need Docker, a server, a Raspberry Pi, a tunnel or a
certificate.

## Set it up

Open a terminal and run these one at a time.

**1. Get the code and the tools.**

```bash
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub
npm install -g pnpm
pnpm install
```

**2. Sign in to Cloudflare.** This opens your browser. Sign in and press
Allow.

```bash
pnpm --filter @circularity/cloudflare exec wrangler login
```

**3. Publish your hub.** Put your own web address after `--domain`.

```bash
pnpm cf:deploy -- --domain repair.example.org
```

The first time, this creates the database and the photo storage on your
account, builds the site and publishes it. It takes two or three minutes. At
the end it prints your hub's addresses.

You only need `--domain` the first time. Cloudflare remembers it, and creates
the DNS record and the HTTPS certificate for you. To try the hub before you
choose a domain, leave `--domain` out and use the `workers.dev` address it
prints.

If the address already has a DNS record, for example because it points at
your Docker hub today, Cloudflare will not replace it for you. Leave
`--domain` out for now, move your data across first (see
[MIGRATION.md](./MIGRATION.md)), and then connect the address as that guide
explains.

**4. Open your web address.** The setup wizard opens, the same as on the
Docker edition. Either set up a new cafe, or choose **Move from an existing
hub** and pick a backup from your current hub. See [MIGRATION.md](./MIGRATION.md).

### Publishing without signing in through the browser

On a machine with no browser, or from an automated job, use an API token
instead of `wrangler login`. Create one in the Cloudflare dashboard under
**My Profile, API Tokens**, starting from the "Edit Cloudflare Workers"
template, and give it D1 and R2 edit rights as well. If you use `--domain`,
it also needs DNS edit rights for that domain. Then:

```bash
export CLOUDFLARE_API_TOKEN=your-token
export CLOUDFLARE_ACCOUNT_ID=your-account-id
pnpm cf:deploy
```

Set `CLOUDFLARE_ACCOUNT_ID` whenever your sign-in can see more than one
Cloudflare account, so the hub goes to the right one.

### Photo storage must be switched on once

Photos live in Cloudflare R2. A new account has to switch R2 on once, in the
dashboard under **R2 Object Storage**, before the first publish. It is free
for the amount a cafe uses, but Cloudflare may ask for card details. If you
skip this, publishing stops with "Please enable R2 through the Cloudflare
Dashboard".

## Settings

The Docker edition's `.env` settings are Worker variables here, with the same
names. Change them in `apps/cloudflare/wrangler.jsonc` under `"vars"` and
publish again, or in the Cloudflare dashboard under Workers, your hub,
Settings, Variables.

| Setting                 | What it does                                                     | Default            |
| ----------------------- | ---------------------------------------------------------------- | ------------------ |
| `TZ`                    | Where your cafe is. Used for "today", session dates and reports  | `Europe/London`    |
| `DEMO_MODE`             | For a public try-it-out site only. See the main README           | `false`            |
| `TELEMETRY_DISABLED`    | Rule out sharing anonymous numbers with the project              | `false`            |
| `UPDATE_CHECK_DISABLED` | Stop asking GitHub once a day whether a new version is out       | `false`            |
| `SECRET_KEY`            | Signs login tokens. Optional: see below                          | made on first run  |

`SECRET_KEY` is optional. If you do not set one, the hub makes a random key the
first time it runs and keeps it in its database. To set your own, run
`pnpm --filter @circularity/cloudflare exec wrangler secret put SECRET_KEY` and
paste a long random string. Changing it signs everyone out.

## Updating

From the folder you set up in:

```bash
git pull
pnpm install
pnpm cf:deploy
```

The site stays up while it updates. Database changes apply by themselves on
the first visit after the update. The admin area tells you when a new version
is out, the same as on Docker.

## Backups

Go to **Settings, Backup & restore** as a super admin and choose **Download
backup zip**. Your browser builds the zip, because a Worker does not have the
time or memory to, so keep the page open until the download starts.

The zip holds every table and every photo. You can restore it into this hub,
into a new Cloudflare hub, or into a Docker hub. See [MIGRATION.md](./MIGRATION.md).

Cloudflare also keeps 7 days of database history on the free plan (D1 Time Travel). To wind
the database back to a moment in the past:

```bash
pnpm --filter @circularity/cloudflare exec wrangler d1 time-travel restore repair-cafe-hub --timestamp 2026-10-07T09:00:00Z
```

Photos are not part of Time Travel, so keep taking backups too.

## Jobs that run every hour

The hub has a few small jobs: sending its numbers to the project (only if you
agreed), checking for a new version, and refreshing the list of Repair Cafés
for the map. They run in the background after someone visits the site, at
most once an hour, so the visitor never waits.

This means the hub needs no cron trigger. The free plan allows only five per
account, and other projects on the same account may have used them. If you
have one to spare and want the jobs to run on the hour even when nobody
visits, add `"triggers": { "crons": ["17 * * * *"] }` to
`apps/cloudflare/wrangler.jsonc`.

## What the free plan gives you

| Limit                     | Free plan                       | A busy cafe uses about        |
| ------------------------- | ------------------------------- | ----------------------------- |
| Requests                  | 100,000 a day                   | a few thousand on a session day |
| Database storage          | 5 GB                            | under 50 MB after years       |
| Database reads and writes | 5 million reads, 100,000 writes a day | a few thousand           |
| Photo storage             | 10 GB                           | around 300 KB a photo         |

Cloudflare's free plan also allows about 10 milliseconds of computing time for
each request. Most of the hub's requests use 1 to 10 ms. Public pages take
longer to draw, so a copy is kept for a minute and handed to the next visitor,
which costs almost nothing. A few things take much longer, but happen rarely:
drawing a sharing picture for the first time, and the very first sign-in of
someone moved from a Docker hub, whose old password has to be checked the slow
way once. Cloudflare allows short bursts like these. In testing they always
worked.

If you ever see "Error 1102" or a 503 page, a request ran out of computing
time. Wait a moment and try again, and please tell us what you were doing.

## Working on the code

```bash
pnpm cf:test      # runs the tests inside the real Workers runtime
pnpm cf:dev       # runs the hub on your own computer, with a local database
```

The code is in `apps/cloudflare`. [PLAN.md](./PLAN.md) explains how it is put
together.

## If something goes wrong

- **"Authentication error" when publishing.** Run the `wrangler login` step
  again.
- **The domain does not work.** It must be on the same Cloudflare account,
  with its nameservers pointing at Cloudflare. It can take a few minutes for a
  new certificate.
- **"Please enable R2".** Switch on R2 in the dashboard once (see above), wait
  a minute, and publish again.
- **"A DNS record already exists".** Something else uses that address. See
  "Connect your address" in [MIGRATION.md](./MIGRATION.md).
- **A page shows old information.** Public pages are kept for one minute for
  visitors who are not signed in. Signed-in staff always see the latest.
- **See what the hub is doing.** `pnpm --filter @circularity/cloudflare exec wrangler tail`
  shows each request as it happens, with any errors.
