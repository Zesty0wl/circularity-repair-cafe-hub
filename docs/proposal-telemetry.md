# Proposal: telemetry, and a map of everyone running this

**Status:** built. The collector is live at
<https://repaircafetelemetry.bzwrd.co.uk>, and its source is at
[circularity-repair-cafe-collector](https://github.com/Zesty0wl/circularity-repair-cafe-collector).
The sending half is `apps/server/src/services/telemetry.ts` in this repository.
**Written:** 26 July 2026, built 27 July 2026

## What we want

Every install of this project is a repair cafe somewhere, fixing things. We
have no idea how many there are, what versions they run, or how much they have
collectively kept out of landfill. We would like to know, and we would like to
show it: a map of the community with real numbers on it.

Two separate things come out of that:

1. **Product telemetry.** How many installs, which versions, which features get
   used. This tells us where to spend effort and when it is safe to drop old
   code.
2. **A community impact map.** Cafes that want to be on it, with their repair
   and CO₂ numbers, on a public page.

They need different amounts of consent, and that difference is the whole design.

## The thing to get right first

This is other people's software, on other people's servers, holding other
people's data. We are proposing that it phones home by default. That is a
reasonable thing to want and plenty of good projects do it, but it goes wrong
in three specific ways and all three are avoidable.

**Each cafe is its own data controller.** Their repair records are theirs, not
ours. The moment we receive something about an identifiable organisation we
become a controller too, and we need a lawful basis for it. Aggregate counts
with no name attached are a very different proposition to "Woodville Repair
Café, here is what they did".

**Free text is where personal data hides.** `item_description`,
`fault_description`, `outcome_notes` and `parts_used` are boxes a volunteer
types into at a busy table. They contain things like "Mrs Shaw's kettle" and
"ring John on 07…". None of that can ever leave the building, and the safest
way to guarantee it is to send no free text at all, ever, not even filtered.

**Default-on phone-home is how open-source projects lose their community.** It
is survivable when it is disclosed loudly, aggregate only, trivially switched
off, and the code that does it is short enough to read. It is not survivable
when someone discovers their cafe's name arriving at a server they never
agreed to talk to.

So the proposal is **two levels**, and we ask about both during setup rather
than deciding for anybody. They have names rather than numbers, because a
number implies there is a bigger one you have not been offered:

| | **Standard** | **Community** |
|---|---|---|
| What it says | "an install did 512 repairs" | "Woodville Repair Café did 512 repairs" |
| Identifies the cafe | no | yes |
| On the setup screen | **ticked** | **not ticked** |
| Turn off | one switch, or `TELEMETRY_DISABLED=true` before first boot | same switch |

Asking beats defaulting, and it costs one screen. Nothing is sent until the
question has been answered, which also solves the awkward case of cafes that
upgrade into this having never been asked. See "Where the choice gets made".

There is also a nice shortcut for Community. Most cafes are already listed
publicly on repaircafe.org, and we already mirror that directory
(`services/repairCafeNetwork.ts`). So a cafe on the map can send us its
repaircafe.org slug and nothing else, and the collector looks the name and
coordinates up from the public directory. We then hold no location data of our
own at all.

## What we would collect

### Standard: anonymous counts, ticked by default

One JSON body, once a day:

```json
{
  "schemaVersion": 1,
  "level": "standard",
  "installId": "3f2b…",
  "sentAt": "2026-07-26T18:04:11Z",
  "app": { "version": "1.0.0" },

  "howManySessions": 34,
  "howManyVenues": 2,
  "howManyVolunteers": 8,
  "firstSession": "2025-03-08",
  "latestSession": "2026-07-11",

  "repairsRecorded": 512,
  "repairsFixed": 300,
  "repairsNotFixed": 120,
  "repairsPaused": 4,
  "repairsReturned": 88,

  "co2": {
    "enabled": true, "savedKg": 4210.5,
    "fromThisManyRepairs": 288, "displacementRate": 0.5
  },
  "kindsOfThing": [ { "kind": "kettle", "howMany": 22, "fixed": 15 } ],
  "featuresInUse": {
    "galleryPhotos": 42, "eventPhotos": 118, "localCafesChosen": 4,
    "showsStats": true, "showsEventStats": true, "usesPlausible": true
  },
  "cafe": null
}
```

Three details worth arguing for:

- **Every field name is a count, and reads like one.** This JSON is shown to the
  admin on the setup screen, so the field names are user-facing copy. `"total"`
  or `"repairs"` reads like "all of our repairs, sent to you". `repairsRecorded:
  512` cannot be read as anything but a number. Same reason `kindsOfThing` is
  not `items`: nobody should have to wonder whether we mean their items.
- **`kindsOfThing` uses the CO₂ factor key, not the cafe's own category names.** Skill
  categories are free text an admin can rename to anything. Factor keys come
  from the Restart Project's fixed vocabulary, which every install shares. That
  makes the numbers comparable across cafes and removes a free-text field.
- **Everything is a cumulative total, not a daily delta.** A missed day then
  heals itself on the next send, so the client needs no outbox, no retry queue
  and no ordering guarantees. This matters more than it sounds: it is the
  difference between a 60 line sender and a 400 line one.

### Community: on the map, an explicit tick

`cafe` stops being null and becomes either of:

```json
"cafe": { "repaircafeSlug": "woodville-repair-cafe" }
"cafe": { "name": "…", "publicUrl": "…", "lat": 52.77, "lng": -1.52 }
```

The first form is preferred and we look the rest up. The second is the fallback
for a cafe not listed on repaircafe.org, with coordinates rounded to two
decimal places, which is about a kilometre.

### What we never collect

Worth writing down as a rule the code enforces, not a promise in a document:

- No free text of any kind. No item descriptions, faults, outcome notes, parts,
  photo captions, admin notes or venue directions.
- No people. No volunteer names, emails, avatars or per-repairer figures.
- No visitors. Nothing from a check-in, no customer names, no contact details,
  no tracking tokens.
- No images, no backups, no credentials, no database rows.
- No raw IP address stored. The collector needs the IP to rate limit, derives a
  country from it, and keeps only the country.

## Changes to this project

### 1. Somewhere to keep the choice

New columns on `cafes` (additive, idempotent, same as every other migration):

| Column | Type | Default | What it is |
|---|---|---|---|
| `telemetry_level` | text | `none` | `none`, `standard` or `community` |
| ~~`telemetry_share_identity`~~ | | | Folded into the level above |
| `telemetry_install_id` | uuid | generated once | Who we are, anonymously |
| `telemetry_token` | text | null | Issued by the collector on first contact |
| `telemetry_last_sent_at` | timestamptz | null | So a restart does not re-send |
| `telemetry_acknowledged_at` | timestamptz | null | See "existing installs" below |

The columns start off and the setup answer turns them on, so a half-finished
install that never reached the question sends nothing.

Plus an env var `TELEMETRY_DISABLED=true`, checked before anything else, so a
sysadmin running this for a client can rule it out before first boot without
touching a browser, and so the answer to "how do I stop this entirely?" is one
line in a compose file.

### 2. A sender

New `services/telemetry.ts`: build the payload from the same SQL the stats
endpoints already use, post it, store the token and the timestamp. Perhaps 150
lines. It must never throw into a request path, never log above `warn`, and
never delay startup.

### 3. A scheduler, which we do not have

This is the only genuinely new machinery. Right now nothing in the server runs
on a timer: the directory refresh is on demand and backups are manual.

The smallest thing that works is a `setInterval` started after boot:

- Wait 5 minutes after startup, so a restart loop cannot hammer the collector.
- Then every hour, check whether `telemetry_last_sent_at` is more than 20 hours
  ago, and send if so.
- Jitter the hour by a value derived from the install id, so a thousand cafes
  do not all arrive at midnight.

No new dependency, no s6 service, and it survives restarts because the decision
is made from a stored timestamp rather than an in-memory counter.

### 4. Where the choice gets made

Nothing is ever sent until somebody has been asked and has answered. That single
rule replaces "on by default", and it makes the rest of this defensible without
having to argue about it.

**New installs: a step in the setup wizard.**

The wizard is seven steps today, collecting everything and posting one payload at
the end. This becomes step 7 of 8, between the branding and the final review, so
the question is answered before the hub has done anything at all.

```
+--------------------------------------------------------------+
|  ......o   Step 7 of 8                                       |
|                                                              |
|  Help us show what repair cafes achieve                      |
|                                                              |
|  This project is free and we have no idea how many cafes     |
|  use it. Your hub can send us a short summary once a day.    |
|                                                              |
|  +--------------------------------------------------------+  |
|  | [x]  Standard                                          |  |
|  |      Send counts only: how many repairs you have done, |  |
|  |      how many sessions you have held, and which        |  |
|  |      version you run.                                  |  |
|  |      No names. No text anyone typed. Nothing at all    |  |
|  |      about your visitors or your volunteers.           |  |
|  +--------------------------------------------------------+  |
|  +--------------------------------------------------------+  |
|  | [ ]  Community                                         |  |
|  |      Everything in Standard, and your cafe name and    |  |
|  |      roughly where you are, so you appear on our       |  |
|  |      public map with your numbers beside you. It       |  |
|  |      helps people find you.                            |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  > See exactly what would be sent                            |
|                                                              |
|  You can change this whenever you like under Settings, and   |
|  ask us to delete everything we hold about you.              |
|                                                              |
|                              [ Not now ]    [ Continue ]     |
+--------------------------------------------------------------+
```

Four things on that screen are doing real work:

- **"See exactly what would be sent" prints the actual JSON**, built from this
  cafe's own data rather than an example. It is the most trust-building thing we
  can put on the page, it costs one endpoint, and it means nobody has to take
  our word for anything.
- **"Not now" is a real button**, not a link in small print. It turns both
  switches off and marks the question answered.
- **The two levels are named, not numbered.** "Tier 1" invites the question of
  what tier 2 takes that you were not told about. "Standard" and "Community"
  each say what they are, and Community is plainly Standard plus being findable.
- **The second box is not ticked to start with.** See below.
- **The wording says what is not sent**, because that is what an admin is
  actually worried about.

**Why the second box starts unticked.** The first is a count with no name on it,
so ticked by default with a plain explanation beside it is fine. The second
publishes somebody else's organisation on a website we control, and a pre-ticked
box is not a decision to publish. It is also exactly the thing that gets
screenshotted. Better to sell it than to default it: cafes want to be findable,
so show them the map and let them choose to join.

**Existing installs.** The same screen, shown once as a panel on the admin
dashboard after upgrading, and nothing is sent until it is answered.
`telemetry_acknowledged_at` stays null until then and the sender checks it before
doing anything. This is the case that matters most, because every cafe already
running the project would otherwise start phoning home on next boot having never
been asked.

**Afterwards.** A Telemetry section in Settings with the same two levels, the
same JSON preview, when we last sent, and a "delete everything you hold about
us" button that calls the collector's forget endpoint.

### 5. What that step needs from the code

| Piece | Where |
|---|---|
| Two booleans in the wizard state, posted in the payload it already sends | `routes/setup/+page.svelte` |
| A `telemetry` block accepted and written | `routes/setup.ts` |
| `GET /api/admin/telemetry/preview`, returning the real payload | new |
| Dashboard panel for installs that upgraded into this | `routes/admin/dashboard/+page.svelte` |
| Settings section | `routes/admin/settings/+page.svelte` |

The wizard's length is a single constant and every step is a branch in one
`{#if}`, so adding one is genuinely small.

### 6. Words

README section, `docs/07-settings-reference.md` entry, a line in the Raspberry
Pi guide, and a plain-English privacy page on the telemetry site itself that the
hub links to.

## PRD: the telemetry server

### Purpose

Receive one small JSON body per install per day, keep the history, and publish
aggregate numbers. Nothing else.

### Users

| Who | What they need |
|---|---|
| Us | How many installs, which versions, is anyone using feature X |
| A cafe on the map | Their pin, their numbers, and a way to be removed |
| A visitor | "This community has repaired 41,000 things" on a public page |

### Not in v1

The public map. Per-cafe dashboards. Any login. Real-time anything. Alerting.
v1 is ingest, store, and a private view for us. The map is v2, once there is
data worth putting on one.

### Stack

Same as the hub, deliberately: Node 22, Fastify, Drizzle, PostgreSQL 16, zod,
one container with s6 supervising both processes. Everything we have already
solved once (idempotent migrations, backup, CSP, health checks) transfers, and
there is one stack to maintain rather than two.

### API

All under `https://repaircafetelemetry.bzwrd.co.uk`.

| Method | Path | Auth | What |
|---|---|---|---|
| POST | `/api/v1/ping` | token after first call | Ingest. First call has no token and gets one back. |
| POST | `/api/v1/forget` | token | Delete this install and every ping it sent. |
| GET | `/api/v1/public/summary` | none | Worldwide totals, cached. |
| GET | `/api/v1/public/map` | none | Opted-in cafes with their numbers. v2. |
| GET | `/health` | none | For the container healthcheck. |

`POST /api/v1/ping` returns `{ "ok": true, "token": "…", "nextPingAfter": "…" }`.
The token is returned only on the call that mints it. `nextPingAfter` lets us
push clients to back off without shipping new client code, which is the kind of
lever you want on day one and cannot add later.

### Data model

```
installs
  id                 uuid primary key      -- the id the client generated
  token_hash         text not null         -- bcrypt or sha256, never the token
  created_at         timestamptz
  last_seen_at       timestamptz
  app_version        text
  country            text                  -- derived from IP, IP discarded
  cafe_slug          text null             -- repaircafe.org slug, Community only
  cafe_name          text null             -- fallback, Community only
  identity_url       text null
  identity_lat       numeric(6,2) null
  identity_lng       numeric(6,2) null
  is_blocked         boolean default false

pings
  id                 bigserial primary key
  install_id         uuid references installs(id) on delete cascade
  received_at        timestamptz
  sent_at            timestamptz           -- the client's own clock
  payload            jsonb                 -- the whole validated body
  repairs_total      int                   -- extracted for querying
  repairs_completed  int
  co2_saved_kg       numeric
  events_held        int
  volunteers         int
```

Keeping the raw payload as `jsonb` alongside extracted columns is the pragmatic
choice for v1: we can re-derive any figure we did not think of, without asking
anyone to re-send.

**One trap to write down now.** Pings carry cumulative totals, so worldwide
figures are `SUM` over *the latest ping per install*, never over the whole
table. Summing every row multiplies every cafe by the number of days it has
been running. That is the bug this project will otherwise ship, and it will look
plausible for months.

```sql
SELECT SUM(repairs_completed), SUM(co2_saved_kg)
FROM (
  SELECT DISTINCT ON (install_id) *
  FROM pings ORDER BY install_id, received_at DESC
) latest;
```

### Anti-abuse

Anyone can post to an open ingest endpoint, so:

- zod schema, reject anything that does not match exactly.
- 64 KB body cap, and a cap on the `items` array length.
- Rate limit per token and per IP. One ping a day is expected; ten an hour is
  someone playing.
- Reject `sentAt` more than 48 hours from our clock.
- `is_blocked` so we can drop a noisy install without a deploy.
- Counters that only ever go up, per install. A total that halves is worth
  flagging rather than trusting.

### Retention

Raw pings for 24 months, then roll up to monthly per install and drop the rows.
An install that has not been seen for 12 months is dormant, and its identity
fields are cleared while the anonymous counts stay. `/api/v1/forget` removes
everything within the request.

### Hosting on nostromo

The hub already runs here, so the whole path is known and this is a copy of it.

**How a request reaches a container today**

```
browser
  → Cloudflare (proxied DNS, orange cloud)
  → nostromo:443
  → nginx vhost in /etc/nginx/sites-available/<domain>
      ssl_certificate /etc/ssl/certs/cloudflare/cloudflare_<domain>.pem
      proxy_pass http://127.0.0.1:<port>
  → container, published on 127.0.0.1 only
```

nostromo is a Plesk box, but Plesk is not doing this routing. Application
domains are plain nginx vhosts in `sites-available`, and TLS is a Cloudflare
Origin Certificate per domain. `repaircafe.circularity.org` is exactly this,
pointing at `127.0.0.1:5026`.

**What this means for us**

- `bzwrd.co.uk` is already served here, with ten subdomains and an existing
  origin certificate at `/etc/ssl/certs/cloudflare/cloudflare_bzwrd.pem`. So
  `repaircafetelemetry.bzwrd.co.uk` is a drop-in: one new vhost copied from
  `omnipost.bzwrd.co.uk`, no new certificate, no DNS beyond one proxied A
  record.
- **Port 5040 is free.** 5025 to 5030 is the Circularity cluster and 5031 is
  taken, so 5040 leaves room and does not look like a typo for another service.
- Every app on this box brings its own database rather than sharing one, so the
  hub's single container with Postgres inside it is the house pattern. Keep it.

```
~/docker/circularity/repair-cafe-telemetry/
  docker-compose.yml     # 127.0.0.1:5040:3000, own volume
  Dockerfile             # copied from the hub
  .env                   # SECRET_KEY
```

**The one thing I cannot do myself:** this account has no passwordless sudo, so
writing `/etc/nginx/sites-available/repaircafetelemetry.bzwrd.co.uk` and
reloading nginx needs you, or needs sudo rights. Everything below `~/docker` I
can do.

**Two things found while checking, worth fixing separately**

1. `mac-app-tracker.protolab.live` proxies to `127.0.0.1:5026`, which is the
   repair cafe hub. That domain is publicly serving Repair Café Woodville right
   now. The comment in its own vhost says it should be port 5020.
2. The README says public access is by Cloudflare Tunnel. It is not. There is no
   `cloudflared` on the box; it is Cloudflare proxied DNS to nginx with an
   origin certificate. The Raspberry Pi guide describes a tunnel, which is fine
   for a Pi, but the description of this deployment is wrong.

## What I would want decided before building

1. **Community on the setup screen.** I have proposed unticked. Ticked is your
   call and I will build it, but then the README has to say so above the fold.
2. **What "Not now" means later.** Do we ask again on a future upgrade, or is
   the answer final until they go to Settings? I would ask once more, at most
   once a year, and never again after a second no.
3. **How honest the public map is.** A cafe that opts out is invisible, so the
   worldwide total is a floor, not a count. The page should say that, the same
   way the About page says what share of repairs the CO₂ figure covers.
4. **Whether we ever publish per-cafe numbers, or only pins.** "Woodville: 512
   repairs" is more interesting and more sensitive than a dot on a map.
5. **Who is the data controller** for the telemetry database, and whose privacy
   policy the hub links to.

## Rough size

| Piece | Size |
|---|---|
| Hub: columns, migration, settings, setup step, dashboard notice | small |
| Hub: payload builder and sender | small |
| Hub: the scheduler | small, but it is new machinery |
| Server: project skeleton, reusing the hub's | small |
| Server: ingest, validation, tokens, rate limiting | medium |
| Server: our own private view of the data | small |
| Server: deploy on nostromo | small, one vhost and one compose file |
| Public map and impact page | v2, medium |

The hub side is a day. The server side is a day or two once the hosting is
settled. The map is a separate piece of work and should not hold up collecting,
because we cannot draw anything until data has been arriving for a while.
