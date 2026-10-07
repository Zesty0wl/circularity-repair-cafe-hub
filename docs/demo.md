# The public demo site

This page is for the people who run the project's public demo. A cafe does not
need it.

The demo is an ordinary hub with demo mode on, filled with an invented cafe
(Tinkerton Repair Café) by `demo/seed.py`. Its admin password is published,
so it is wiped and filled again whenever somebody changes something, and at
least once a day, because the seed opens a session "today".

## How the reset works

Every hour, GitHub Actions runs `.github/workflows/demo-reset.yml`. It runs:

```
python3 demo/seed.py --base-url "$DEMO_URL" --reset
```

`seed.py` sends the demo's secret key with every request (from the
`DEMO_RESET_KEY` environment variable). Then:

1. It asks the demo whether a rebuild is needed (`GET /api/demo/status`). The
   answer is yes if the data has changed since the last seed, or the date has
   changed. If somebody used the demo in the last ten minutes, it leaves them
   alone, but never for more than three hours.
2. It wipes the demo back to a brand new hub (`POST /api/demo/reset`).
3. It sets the hub up through the same API the browser uses: the cafe,
   volunteers, sessions, repairs and photographs. Demo mode refuses uploads
   and password changes from visitors, but lets the seeder do them because it
   carries the key.
4. It tells the demo it has finished (`POST /api/demo/seeded`), so the next
   run can tell whether anybody changed anything.

Without the key, the `/api/demo/*` routes answer 404, as if they did not
exist. The code is in `apps/cloudflare/src/routes/demo.ts`.

Because the seeder uses the public API, a broken release shows up as a failed
reset. Check the workflow's runs on GitHub now and then.

## Setting it up

The demo has its own Worker, database and bucket, set in the `demo`
environment in `apps/cloudflare/wrangler.jsonc`. It can share a Cloudflare
account with a test site, but should not share one with a real cafe.

1. **Publish it.** In the project folder, signed in to the right Cloudflare
   account (see the [install guide](./install.md), Steps 5 to 9):

   ```
   pnpm demo:deploy
   ```

   The first time, add `--domain demo.example.org` to give it an address. It
   is also reachable at `repair-cafe-demo.<your-subdomain>.workers.dev`.

2. **Give it a reset key.** Make a long random key and keep it in a password
   manager:

   ```
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   Then store it on the Worker. Paste the key when it asks:

   ```
   pnpm --filter @circularity/cloudflare exec wrangler secret put DEMO_RESET_KEY --env demo
   ```

3. **Tell GitHub about it.** In the repository on GitHub, go to **Settings**,
   **Secrets and variables**, **Actions**:
   - under **Secrets**, add `DEMO_RESET_KEY` with the same key
   - under **Variables**, add `DEMO_URL` with the demo's address, such as
     `https://repaircafe.hyperspanner.net`

4. **Seed it for the first time.** On the **Actions** tab, open **Reset the
   demo**, choose **Run workflow**, and tick **Rebuild even if nothing has
   changed**. Or from your own computer:

   ```
   DEMO_RESET_KEY=your-key python3 demo/seed.py --base-url https://demo.example.org --reset --force
   ```

## Updating it

Publish it again with `pnpm demo:deploy`. The next hourly run notices nothing
has changed and leaves the data alone. To rebuild straight away, run the
workflow with **Rebuild even if nothing has changed** ticked.

## Things to know

- GitHub runs scheduled workflows only from the default branch. It can delay
  them by a few minutes on a busy day, and it pauses them in a repository that
  has had no activity for 60 days. If the demo stops resetting, look at the
  **Actions** tab.
- Without `DEMO_RESET_KEY` and `DEMO_URL` set, the workflow does nothing. So
  forks of the project are not affected.
- The photographs come from Flickr each time, and are credited in
  `demo/images.json`. If one disappears from Flickr, the seed carries on
  without it.
