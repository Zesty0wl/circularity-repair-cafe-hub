# Running your hub

Once your hub is [installed](./install.md), there is very little to do. This
page covers the few things you may need: changing a setting, updating, and
finding out what went wrong.

All the commands on this page are typed in a terminal, inside the hub's
folder. If you have just opened a new terminal, move into the folder first:

```
cd circularity-repair-cafe-hub
```

## Settings

Most settings are in the hub itself, under **Settings** in the admin area.
A few belong to the hub as a whole. You set those in the Cloudflare dashboard,
and they stay when you update:

1. Go to <https://dash.cloudflare.com> and open **Workers & Pages**.
2. Open **repair-cafe-hub**, then **Settings**, then **Variables and
   Secrets**.
3. Choose **Add**, type the name and the value, and save. Choose the type
   **Text** for everything except `SECRET_KEY`, which is a **Secret**.

The change takes effect within a few seconds. You do not need to publish
again.

| Name | What it does | If you leave it out |
| --- | --- | --- |
| `TZ` | Where your cafe is, so "today", session dates and reports are right. Use a name from [this list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), such as `Europe/Dublin` or `America/Toronto`. | `Europe/London` |
| `TELEMETRY_DISABLED` | Set to `true` to rule out sharing numbers with the project, whatever an admin chooses in Settings. | `false` |
| `UPDATE_CHECK_DISABLED` | Set to `true` to stop the hub asking GitHub whether a new version is out. | `false` |
| `MAX_UPLOAD_SIZE_MB` | The largest photo, in megabytes, the hub accepts. | `10` |
| `SESSION_MAX_AGE_HOURS` | How many hours a visitor's phone remembers the item they just checked in. | `4` |
| `REFRESH_TOKEN_DAYS` | How many days someone stays signed in on a device they use. | `365` |
| `DATA_RETENTION_DEFAULT_DAYS` | How long visitors' contact details are kept, unless Settings says otherwise. | `365` |
| `EVENT_GENERATION_MONTHS` | How far ahead repeating sessions are created. | `12` |
| `SECRET_KEY` | Signs sign-in tokens. You do not need it: the hub makes its own key the first time it runs. Changing it signs everyone out. | made for you |
| `DEMO_MODE` | Only for a public try-it-out site. See [docs/demo.md](./demo.md). Never set it on a real cafe. | `false` |

## Updating

The admin area shows a line when a new version is out. Updating takes a few
minutes, and the site stays up the whole time. It is still best done a day or
two before a session, so you have time to check it.

```
git pull
pnpm install
pnpm cf:deploy
```

- `git pull` downloads the newest released version of the code.
- `pnpm install` downloads any libraries it needs.
- `pnpm cf:deploy` builds it and publishes it to Cloudflare.

Database changes apply by themselves on the first visit after the update.
Your settings in the Cloudflare dashboard are kept. Afterwards, open your site
and sign in to check all is well. **Settings**, **About** shows the version
you are now running.

To see what changed in each version, read the
[list of changes](../CHANGELOG.md).

**If `git pull` says "Your local changes would be overwritten"**, a file in the
folder was edited. To throw away those edits and take the new version, run
`git checkout -- .` and then `git pull` again. Your cafe's data is not in the
folder, so it is not affected.

### Updating from a different computer

You do not need the computer the hub was set up on. Nothing about your hub is
kept on it: your records, photos, settings and web address are all on
Cloudflare. The folder on that computer is only a copy of the code, and any
computer can download a fresh one.

So if that computer is broken, lost, or belongs to a volunteer who has moved
on, you can update from any Windows, Mac or Linux computer. A borrowed one is
fine.

**What you need**

- A computer you can install programs on.
- Access to your cafe's Cloudflare account: the email and password, or your
  own login as a member of that account. If you do not have this, see
  [If nobody can get into the Cloudflare account](#if-nobody-can-get-into-the-cloudflare-account)
  below first.

**Steps.** These match the [install guide](./install.md), which has more
detail on each.

1. **Install the tools,** if this computer does not have them yet: Git and
   Node.js 22 or newer (install guide, Step 5), then pnpm (Step 6). Open a new
   terminal afterwards.
2. **Download the hub:**

   ```
   git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
   cd circularity-repair-cafe-hub
   pnpm install
   ```

3. **Sign in to your cafe's Cloudflare account:**

   ```
   pnpm --filter @circularity/cloudflare exec wrangler login
   ```

   Your browser opens. Sign in **to the cafe's account**, then click
   **Allow**. To check you are in the right one:

   ```
   pnpm --filter @circularity/cloudflare exec wrangler whoami
   ```

   If it lists more than one account, see
   [Publishing without a browser](#publishing-without-a-browser) for how to
   choose with `CLOUDFLARE_ACCOUNT_ID`.
4. **Publish:**

   ```
   pnpm cf:deploy
   ```

   Do **not** add `--domain`. Your hub keeps its address. It also finds its
   existing database and photo storage by name, and keeps the settings you
   set in the dashboard, so nothing is lost or duplicated. We have tested
   this: publishing from a brand new copy updates the same hub, with all its
   data.
5. **Check it.** Open your site and sign in. **Settings**, **About** shows the
   version you are now running.
6. **On a borrowed computer, tidy up** afterwards. Sign out of Cloudflare, so
   the next person to use the computer cannot change your website, then
   delete the folder:

   ```
   pnpm --filter @circularity/cloudflare exec wrangler logout
   cd ..
   ```

   Then delete the `circularity-repair-cafe-hub` folder as you would any
   other folder.

Next time, if you use the same computer again, just run the three commands
under [Updating](#updating) inside the folder.

**If `pnpm cf:deploy` says it is creating a new database or bucket,** stop it
with Ctrl and C. It means you are signed in to a different Cloudflare
account from the one your hub is on. Run `wrangler whoami` (step 3) and sign
in to the right account.

### If nobody can get into the Cloudflare account

Your hub keeps running, and your volunteers can carry on using it. You just
cannot update it, or change its address, until someone has access again.

- **Someone else is a member of the account.** They can sign in with their own
  login, and invite you (see below).
- **You know the email address it was set up with,** but not the password.
  Use **Forgot password** on Cloudflare's login page. The reset link goes to
  that email address.
- **Nobody can sign in at all.** Contact Cloudflare's support. They will ask
  you to prove the account is yours, so it helps to have the domain's
  registration details to hand.

The best protection is to make sure two people can always get in.

**To invite someone to the account:** the person who can sign in opens the
Cloudflare dashboard, then **Manage Account**, then **Members**, and chooses
**Invite**. Enter the other person's email address and give them the
**Super Administrator** role. They get an email, create their own Cloudflare
login, and from then on sign in as themselves. Nobody has to share a
password, and you can remove a member later, for example when a volunteer
moves on.

## Backups

See [Backups and moving a hub](./backups-and-moving.md).

## What the free plan gives you

| Limit | Free plan | A busy cafe uses about |
| --- | --- | --- |
| Visits to the site | 100,000 requests a day | a few thousand on a session day |
| Database size | 5 GB | under 50 MB after years |
| Database reads and writes | 5 million reads and 100,000 writes a day | a few thousand |
| Photo storage | 10 GB | around 300 KB a photo |

Each request may also use about 10 milliseconds of Cloudflare's computing
time. Almost everything the hub does takes less. Public pages are kept for a
minute after they are drawn and handed to the next visitor, which costs almost
nothing. A few rare things take longer, such as drawing a picture for social
media the first time, and Cloudflare allows short bursts like these.

If you ever see "Error 1102" or a 503 page, a request ran out of time. Wait a
moment and try again. If it keeps happening, please tell us what you were
doing.

## Jobs that run every hour

The hub has a few small jobs: sending its numbers to the project (only if you
agreed), checking for a new version, and refreshing the list of Repair Cafés
for the map. They run in the background after someone visits the site, at
most once an hour, so the visitor never waits. A hub with no visitors runs no
jobs, which does no harm.

This means the hub needs no cron trigger, which matters because the free plan
allows only five on each account. If you have one to spare and want the jobs
to run on the hour even when nobody visits, add
`"triggers": { "crons": ["17 * * * *"] }` to `apps/cloudflare/wrangler.jsonc`.

## Seeing what the hub is doing

To watch each request as it happens, with any errors:

```
pnpm --filter @circularity/cloudflare exec wrangler tail
```

Press Ctrl and C together to stop. The Cloudflare dashboard also keeps logs:
**Workers & Pages**, **repair-cafe-hub**, **Logs**.

## Publishing without a browser

On a machine with no web browser, or from an automated job, use an API token
instead of `wrangler login`:

1. In the Cloudflare dashboard, open your profile, then **API Tokens**, then
   **Create Token**.
2. Start from the **Edit Cloudflare Workers** template. Add **D1: Edit** and
   **Workers R2 Storage: Edit**. If you publish with `--domain`, also add
   **DNS: Edit** for your domain.
3. Create the token and copy it. Cloudflare shows it only once.
4. Find your account ID: it is on the right of your account's overview page
   in the dashboard.

Then, on Mac or Linux:

```
export CLOUDFLARE_API_TOKEN=your-token
export CLOUDFLARE_ACCOUNT_ID=your-account-id
pnpm cf:deploy
```

On Windows (Command Prompt):

```
set CLOUDFLARE_API_TOKEN=your-token
set CLOUDFLARE_ACCOUNT_ID=your-account-id
pnpm cf:deploy
```

Set `CLOUDFLARE_ACCOUNT_ID` whenever your login can see more than one
Cloudflare account, so the hub goes to the right one. Keep the token secret:
anyone with it can change your website.

## If something goes wrong

- **The site shows an error page.** Wait a minute and reload. If it stays,
  run `wrangler tail` (above), reload the page, and look for a red error.
- **A page shows old information.** Public pages are kept for one minute for
  visitors who are not signed in. Signed-in staff always see the latest.
- **Someone cannot sign in.** An admin can send them a new password link from
  **Volunteers**. After ten wrong passwords in ten minutes the hub waits a
  while before it lets that person try again.
- **The domain stopped working.** Check in the Cloudflare dashboard that the
  domain is still **Active**, and that it is still listed under **Workers &
  Pages**, **repair-cafe-hub**, **Settings**, **Domains & Routes**.
- **You need to undo a mistake in the data.** See
  [Backups and moving a hub](./backups-and-moving.md), which also explains
  how to wind the database back to an earlier time.
