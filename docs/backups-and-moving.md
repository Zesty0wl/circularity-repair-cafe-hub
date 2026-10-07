# Backups and moving a hub

One kind of file does three jobs: it is your backup, it restores your hub
after a mistake, and it moves your hub to a new Cloudflare account. This page
also explains how a cafe still on the old Docker edition moves across.

## Take a backup

1. Sign in as the main admin (a "super admin").
2. Go to **Settings**, then **Backup & restore**.
3. Choose **Download backup zip**.

Your browser builds the file, because a Worker does not have the time or memory
to. Keep the page open until the download starts. A cafe with a lot of photos
may take a few minutes.

The zip holds every record and every photo. Anyone with the file can see your
volunteers' and visitors' details, so keep it somewhere private, and not only
on one computer. A shared drive your group already uses is a good place.

**When to take one:** after each session, and before you update the hub.

## Restore a backup

Restoring **replaces everything** on the hub with what is in the backup.

1. Sign in as the main admin.
2. Go to **Settings**, then **Backup & restore**.
3. Under **Restore from a backup**, choose the zip.
4. The page shows what is in it (the cafe, the version it came from and how
   many records) before anything happens. Type the words it asks for, to confirm, and start.

Everybody is signed out at the end. Sign in again with an account from the
backup.

## Wind the database back in time

Cloudflare keeps 7 days of database history on the free plan (it calls this
Time Travel). If someone deleted something by mistake today, you can return the
database to how it was at a moment in the past, without a backup file. In the
hub's folder:

```
pnpm --filter @circularity/cloudflare exec wrangler d1 time-travel restore repair-cafe-hub --timestamp 2026-10-07T09:00:00Z
```

Change the date and time to just before the mistake. The time is in UTC, which
is UK winter time. Everything recorded after that moment is lost, so tell
your volunteers first. Photos are not part of Time Travel, so keep taking
backups too.

## Move to a new Cloudflare account

For example, when the person who set up the hub hands it over to someone else.

1. Take a backup on the old hub.
2. On the new account, follow the [install guide](./install.md) up to and
   including Step 10, but leave out `--domain` for now.
3. Open the new hub's `workers.dev` address. On the first page of the setup
   wizard, choose **Move from an existing hub**, and pick the backup.
4. Check the new hub, then move your web address to it, as in
   [Connect your address](#connect-your-address) below.

## Moving from the old Docker edition

Earlier versions of the hub ran in Docker, on a machine of the cafe's own.
They are no longer supported, but a Docker hub's backup moves across
completely. Nobody has to reset a password, upload a photo again or print new
QR posters. Repair Café Woodville moved this way in October 2026.

### Before you start

Pick a quiet time between sessions. Anything recorded on the old hub after you
take the backup will not be on the new one. You do not need to update the
Docker hub first: version 1.8.4 or newer works.

### 1. Set up the new hub

Follow the [install guide](./install.md) up to and including Step 10. Your
address still points at the Docker hub, so leave out `--domain` and use the
`workers.dev` address it prints. **Do not finish the setup wizard.**

### 2. Take a backup on the Docker hub

Sign in to the Docker hub as a super admin. Go to **Settings**, **Backup &
restore**, and choose **Download backup zip**.

### 3. Import it

On the new hub's first page, choose **Move from an existing hub**, and pick the
zip. The page shows what is in it before anything happens. Press **Move this
hub here**. Keep the page open until it says it has finished. For a typical
cafe this takes under a minute.

### 4. Check it

Sign in with the email and password you used on the old hub. Look at the
dashboard, the sessions, the reports and a few photos. If the Docker hub had
settings in its `.env` file, such as `TZ`, set them again in the Cloudflare
dashboard (see [Settings](./running-your-hub.md#settings)).

### 5. Connect your address

See [Connect your address](#connect-your-address) below.

### 6. Switch off the Docker hub

On the Docker machine, stop the hub, but keep it and its data for a few weeks
until you are sure:

```
docker update --restart=no circularity-repair-cafe-hub
docker stop circularity-repair-cafe-hub
```

The first line stops it starting again by itself when the machine restarts.
This matters: both hubs have the same identity, so if both kept running and
sharing numbers with the project, your cafe would be counted twice. If the
machine runs a Cloudflare Tunnel only for the hub, switch that off too:
`sudo systemctl disable --now cloudflared`.

To start the Docker hub again: `docker update --restart=unless-stopped
circularity-repair-cafe-hub && docker start circularity-repair-cafe-hub`.

## Connect your address

Your address already has a DNS record that sends visitors to the old hub, and
Cloudflare will not replace it on its own. So you remove the old record first.

1. In the Cloudflare dashboard, open your domain, then **DNS**, then
   **Records**. Find the record with your hub's address. Write down its type
   and content (or take a screenshot), so you can put it back. A Docker hub
   behind a tunnel has a CNAME record ending in `cfargotunnel.com`.
2. Delete that record. Your site is unreachable from now until step 3
   finishes, which is usually under a minute.
3. In the hub's folder, run:

   ```
   pnpm cf:deploy --domain repair.example.org
   ```

   Cloudflare creates the new record and the certificate.
4. Open your address. The front page should load.

People who were signed in to the old hub at that address stay signed in. QR
posters keep working, because the check-in links use the same address.

**To go back,** remove the domain from the new hub (dashboard, **Workers &
Pages**, **repair-cafe-hub**, **Settings**, **Domains & Routes**), and add the
old DNS record again.

## What moves, and what does not

Everything in the hub moves: every account and password, session, repair,
photo, QR code, setting and log entry, with the same identities. People stay
signed in, and printed QR posters keep working.

These do not move, and none of them matter:

- The old hub's secret signing key. Browsers quietly get a new sign-in token.
- Settings from a Docker hub's `.env` file. Set them again in the Cloudflare
  dashboard.
- Cached copies of things the hub fetches from the internet. It fetches them
  again.
- Failed sign-in counts. They start again from zero.

**Passwords from a Docker hub** are stored in a format that is slow to check.
Each one is checked once, at that person's next sign-in, which takes about a
second. It is then changed to the faster format the hub now uses.

## The backup file, for the curious

A backup is a zip with a `manifest.json` that says which format it is.

- **Format 2** is what the hub makes today: one JSON file of rows per table in
  `data/`, and every photo in `uploads/`.
- **Format 1** is what the old Docker edition made: a PostgreSQL dump in
  `postgres/dump.sql`, and every photo in `uploads/`. The hub reads it in the
  browser and turns it into format 2 rows as it imports.

Pictures for social media and home screen icons are left out, because the hub
draws them again when asked. The details are in
[`packages/shared/src/backup.ts`](../packages/shared/src/backup.ts).
