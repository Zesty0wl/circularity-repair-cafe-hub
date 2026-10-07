# Moving a hub between Docker and Cloudflare

This is the plan for the cafes already running the Docker edition, so they can
move to the Cloudflare edition without losing anything, and move back if they
want to.

## The short version

1. Set up a Cloudflare hub ([README.md](./README.md)). Stop at the first page
   of the setup wizard.
2. On your Docker hub, go to **Settings, Backup & restore** and choose
   **Download backup zip**.
3. On the new hub's first page, choose **Move from an existing hub** and pick
   that zip.
4. Check the new hub. Then point your domain at it.

Nobody has to reset a password, re-upload a photo or print new QR posters.

## What the design had to get right

| Need                                                 | How it is met                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Work with the Docker hubs that exist today           | The Cloudflare hub reads the backup Docker already makes. No Docker update is needed to move |
| Keep every record                                    | Every table and every uploaded file is copied, with the same ids              |
| Keep passwords                                       | bcrypt hashes are copied as they are, checked once at the next sign-in, then replaced |
| Keep people signed in                                | Sign-in sessions are copied. A browser signed in to the old hub at the same address stays signed in |
| Keep printed QR posters working                      | Sessions keep their check-in links, and the QR pictures are copied            |
| Keep visitors' tracking links working                | Visitor tokens are copied                                                     |
| Work within Cloudflare's limits                      | The browser unpacks the zip and sends it in small pieces. The Worker never holds the whole backup |
| Be safe to repeat                                    | Rows already sent are skipped, so a dropped connection just means sending again |
| Be safe to stop halfway                              | The cafe row goes in last, so an unfinished import leaves a hub that is still "not set up" and can be imported into again |
| Allow a way back                                     | A Docker hub can restore a backup from the Cloudflare edition                 |
| Not need anyone to touch a database                  | Everything is done in the hub's own pages                                     |

## The backup formats

Both are zip files with a `manifest.json` that says which format they are.

**Format 1** is what the Docker edition has always written:

```
manifest.json          { "backupFormatVersion": 1, "appVersion": "1.8.4", ... }
postgres/dump.sql      pg_dump --format=plain
uploads/...            every uploaded file: photos, branding, QR codes
```

**Format 2** is what the Cloudflare edition writes:

```
manifest.json          { "backupFormatVersion": 2, "edition": "cloudflare", "tables": [...], ... }
data/<table>.json      one JSON array of rows per table
uploads/...            every uploaded file
```

The rows in format 2 are "portable rows": one JSON object per row, keyed by
the database column name, with plain JSON values (text, numbers, true and
false, ISO 8601 times, JSON objects, lists of text, null). Neither database's
own types appear, so either edition can load them. The definition is in
[`packages/shared/src/backup.ts`](../../packages/shared/src/backup.ts).

Sharing pictures and home screen icons (`uploads/og`, `uploads/pwa`) are left
out of format 2 because both editions draw them again when asked.

## Docker to Cloudflare, step by step

### Before you start

- Pick a quiet time. Anything recorded on the old hub after you take the
  backup will not be on the new one, so do it between sessions, not during
  one.
- Update the Docker hub if you like, but you do not have to. The import was
  tested with a backup from version 1.8.4, older than the Cloudflare edition.

### 1. Set up the Cloudflare hub

Follow [README.md](./README.md) as far as "Open your web address". If your
domain already points at the Docker hub, leave out `--domain` for now and use
the `workers.dev` address the deploy prints.

### 2. Take a backup on the Docker hub

Sign in as a super admin. Go to **Settings, Backup & restore**, and choose
**Download backup zip**.

### 3. Import it

On the Cloudflare hub's first page, choose **Move from an existing hub**, and
pick the zip. The page shows what is in it (the cafe's name, the version it
came from, and how many accounts, sessions, repairs and files) before anything
happens. Press **Move this hub here**.

The browser then:

1. reads the backup from your computer. A Docker backup holds a pg_dump,
   which the page turns into portable rows itself
2. asks the hub to start an import. On a hub that is not set up yet, anyone
   can do this, exactly as anyone can finish the setup wizard. The hub clears
   itself and gives back an import token that the rest of the steps must carry
3. sends the rows, a table at a time in batches of up to 200, parents before
   children so every reference is already there when it arrives
4. sends each photo and branding file, three at a time
5. asks the hub to finish. It fills in anything the old hub did not have,
   such as the Linux page wording or newer CO2 reference data, and writes a
   line in the audit log

On the demo hub (8 accounts, 9 sessions, 61 repairs and 38 photos), this took
about eight seconds.

### 4. Check it

Sign in with the email and password you used on the old hub. Look at the
dashboard, the events, the reports and a few photos.

The hub tells you if its saved web address is still the old hub's. If you will
use a different address from now on, change it under **Settings, Cafe
profile**, because the QR codes for new sessions use it.

### 5. Switch the domain

When you are happy, point your domain at the Cloudflare hub:

1. Stop the Docker hub's tunnel, or remove the DNS record that points at it.
2. Run `pnpm cf:deploy -- --domain your.domain` once.

People who were signed in to the old hub at that address stay signed in. QR
posters keep working, because the check-in links are on the same address.

Keep the Docker hub, switched off, for a few weeks until you are sure.

## Cloudflare back to Docker

Take a backup on the Cloudflare hub (**Settings, Backup & restore, Download
backup zip**), and restore it on the Docker hub the usual way (**Settings,
Backup & restore, Wipe and restore**). This needs the Docker edition from this
branch or later, which can read format 2:

- `apps/server/src/services/backup.ts` loads the portable rows inside one
  transaction, so a restore that fails leaves the hub as it was.
- `apps/server/src/utils/password.ts` accepts the PBKDF2 hashes the Cloudflare
  edition stores, and replaces each with bcrypt at that person's next sign-in.

## Passwords, in detail

The Docker edition stores bcrypt hashes at cost 12. A Cloudflare Worker on the
free plan is allowed about 10 ms of CPU per request, and one bcrypt check at
cost 12 takes about 300 ms, so the Cloudflare edition stores PBKDF2-SHA256
(100,000 rounds, built into the Worker) instead.

| Moving             | At the next sign-in                                                    |
| ------------------ | ---------------------------------------------------------------------- |
| Docker → Cloudflare | The bcrypt hash is checked once with bcryptjs (about a second), then replaced with PBKDF2 |
| Cloudflare → Docker | The PBKDF2 hash is checked with Node's crypto, then replaced with bcrypt |

On the live test hub the first sign-in after the move took 1.2 seconds and
the second 0.5 seconds. Both worked.

## What does not move

- The Docker hub's `SECRET_KEY`. Access tokens last 15 minutes, and browsers
  get a new one from their refresh cookie, so nobody notices.
- Its `.env` settings, such as `TZ` and `TELEMETRY_DISABLED`. Set them again
  as Worker variables ([README.md](./README.md#settings)).
- Cached copies of the Repair Café directory and the update check. They are
  fetched again.
- Failed sign-in counts. They start again from zero.

The telemetry install id does move, so a cafe that shares its numbers carries
on as the same cafe rather than appearing as a new one.

## How it was tested

- **Unit and integration tests** (`pnpm cf:test`, 44 tests in the real Workers
  runtime). One imports a hand-written pg_dump with every column type and an
  older schema, checks the passwords and a carried-over sign-in, then takes a
  format 2 backup and restores it over the top and compares every table.
- **A real Docker backup.** A backup downloaded from the public demo hub
  (Docker, version 1.8.4) was imported into the live Cloudflare test hub
  through the setup page in Chrome. The public figures on both hubs were then
  identical: 7 sessions held, 61 repairs, 40 fixed, 73% success, 1,016 kg of
  CO2, 7 volunteers, 9 events and 20 photos.
- **The way back.** A format 2 backup of the live Cloudflare hub was restored
  into the Docker edition's server running on a real PostgreSQL 16. Every
  figure matched again, the photos were served, and a password that had been
  turned into PBKDF2 on Cloudflare signed in on Docker and was turned back
  into bcrypt.

## What could still go wrong

| Risk                                       | What happens                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| The browser tab is closed halfway          | Start the import again. The hub is still "not set up" until the very end |
| A slow connection drops a batch            | The page tries each batch four times. Rows already sent are skipped      |
| A very large backup (thousands of photos)  | It takes longer, a few minutes per thousand photos, but nothing is held in memory for long |
| A backup from a newer hub                  | Refused with a message to update the hub first                           |
| Someone else finds a new hub before you    | The same as the setup wizard today: set up straight after deploying      |
