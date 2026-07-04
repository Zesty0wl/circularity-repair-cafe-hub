# 2. Branding & home page

Everything that makes your hub look like *your* cafe lives in
**Settings** (`/admin/settings`). The public site updates as soon as you save.

## Cafe profile (the basics)

In the **Cafe profile** tab:

| Field            | Where it shows up                                                    |
| ---------------- | -------------------------------------------------------------------- |
| Cafe name        | Header, hero, browser tab, all emails                                |
| Tagline          | Hero, default page title for SEO                                     |
| Short description| Under the hero on the home page                                      |
| Contact email    | Footer + contact section                                             |
| Phone            | Contact section                                                      |
| Public URL       | QR codes — must match your reverse-proxy hostname                    |
| Primary colour   | Buttons and accents across the public + admin site                   |
| Facebook / X / Instagram URLs | Footer + contact section                                |

The **Public URL** matters: it's encoded into the QR code on every event
poster, so customers scanning the poster end up at the right place. If you're
behind nginx + Cloudflare, this should be your public hostname (e.g.
`https://repaircafe.example.org`), not `127.0.0.1`.

### Logo and banner

Underneath the same tab:

- **Logo** — square works best. Shown in the header and as a badge in the
  hero. Allowed formats: JPEG, PNG, WebP.
- **Banner** — wide image (~1600×600). Used as the home-page hero background
  with a coloured overlay so text stays readable on top.

Both are auto-resized server-side to keep page-load times sensible (longest
edge 1600px, ~85% quality).

## Editing the home page text

The **Home page** tab lets you edit four sections of body content. Leave any
section blank to hide it from the public site:

- **Intro / About** — the "What & Who" paragraph at the top of the page.
- **How it works** — numbered steps (e.g. *Bring it along → Check it in →
  Repair together → Take it home*). Add as many as you like.
- **What to bring** — customer guidance. Bullet points work well — start
  each line with `• ` (bullet + space).
- **FAQs** — question and answer pairs, displayed as an accordion at the
  bottom of the home page.

The default content covers the basics — start by editing it rather than
deleting it.

## Photo gallery

The **Gallery** tab lets you upload photos that appear in a grid on the home
page (between "How it works" and the rest of the content). You can:

- Upload multiple files at once.
- Add an optional caption to each (shown on hover).
- Reorder with the up/down arrows.
- Delete individual photos.

Photos are automatically resized to a longest edge of 1800px and re-encoded
as JPEG, so feel free to upload straight from a phone or DSLR.

## SEO & social previews

The **SEO & analytics** tab controls how your site appears in Google results
and social-media previews:

- **Page title** — what shows in the browser tab and in search results.
  Leave blank to auto-generate from `Cafe name — Tagline`. ~60 characters
  works best.
- **Meta description** — the snippet under the page title in search results.
  Leave blank to use your short description. ~150 characters works best.
- **Favicon** — the small icon shown in browser tabs. Square, 32–256px.
  PNG, JPEG, WebP, or SVG.
- **Social share image (Open Graph)** — what appears when someone shares
  your URL on Facebook, LinkedIn, Slack, X, WhatsApp, etc. Aim for ~1200×630.
  Falls back to your banner if blank.

These tags are rendered **server-side**, so social crawlers (which usually
don't run JavaScript) see them properly.

## Optional: Plausible analytics

If you'd like privacy-friendly, cookie-free analytics, the **SEO & analytics**
tab also has a section for [Plausible](https://plausible.io). Both fields are
optional — leave blank to disable analytics entirely.

- **Site domain** — the domain you registered in your Plausible dashboard
  (e.g. `repaircafe.example.org`).
- **Script URL** — `https://plausible.io/js/script.js` for managed Plausible,
  or your self-hosted script URL.

When both fields are set, the `<script defer …>` tag is automatically added
to every page (server-side and client-side). No cookies, no consent banner
required, GDPR-friendly.

We don't ship a Google Analytics integration — but because the script tag
goes through the same allow-listed CSP, you can paste any `https://…/script.js`
URL that works for you.

## Tips

- The **Cafe profile** save button only saves the profile fields. The
  **Home page**, **Gallery** and **SEO & analytics** tabs each have their
  own save buttons. Switching tabs without saving will lose your changes.
- Image uploads happen *immediately* when you choose a file — there's no
  separate "Upload" button. The preview updates in place.
- The **Public URL** is also used for canonical links and Open Graph URLs,
  so make sure it's right before sharing posts on social media.
