# 7. Settings reference

Every tab on `/admin/settings`, every field, every "what does that do?"
question, in one place. Skim the whole thing once so you know what's
where; come back later when you need a specific setting.

## Tab: Cafe profile

The basics. Used everywhere — header, hero, footer, emails, QR codes.

| Field             | Used for                                                      |
| ----------------- | ------------------------------------------------------------- |
| Cafe name         | Header logo text, browser tab, hero, OG title                 |
| Tagline           | Hero subtitle, default page title for SEO                     |
| Short description | Below hero on the home page; default meta description         |
| Contact email     | Footer, contact section                                       |
| Phone             | Contact section (optional)                                    |
| Public URL        | **Encoded into every QR code.** Match your reverse-proxy domain. |
| Primary colour    | Buttons, links, accents across the public + admin UI          |
| Facebook URL      | Footer / contact icon link (optional)                         |
| Twitter / X URL   | Footer / contact icon link (optional)                         |
| Instagram URL     | Footer / contact icon link (optional)                         |
| Logo              | Header + hero. Square, JPEG/PNG/WebP. Auto-resized.           |
| Banner            | Hero background. Wide (~1600×600). Auto-resized.              |

**Save changes** at the bottom commits this tab. *(Other tabs save
separately.)*

## Tab: Home page

The editable body content of `/`. Each section is optional — leave blank
to hide.

- **Intro / About** — heading + body. The "What & Who" paragraph at the
  top of the home page.
- **How it works** — ordered list of steps (title + body each). Use the
  **Add step** button to add more. Bin icon removes one.
- **What to bring** — heading + body. Use bullet points (start each line
  with `• `).
- **FAQs** — question + answer pairs displayed as an accordion. **Add
  FAQ** to add more.

Stored as a JSONB blob on the cafe row — so flexible structure without
DB migrations.

**Save home page** commits this tab.

## Tab: Linux Repair Cafe

Optional, and **off until you turn it on**. Helps people move an ageing
computer to Linux instead of throwing it away.

- **We are a Linux Repair Cafe**. The master switch. On, it adds a menu
  item, a public page, a card on your home page and a Linux section in
  the admin sidebar. Off, none of that exists. Switching it off hides
  everything but deletes nothing.
- **Menu item**. What the public menu link is called.
- **Top of the page**. The big heading and the line under it.
- **Card on your home page**. Heading, body and button label for the
  card that explains what this is and links to the page.
- **What a Linux Repair Cafe is**. The opening explanation. Blank lines
  start a new paragraph.
- **How it works**. Numbered steps, same editor as the home page.
- **What to bring**. Bullet points. **Keep the warning that installing
  Linux erases the computer.**
- **FAQs**. Question and answer pairs.
- **Our numbers**. Show how many computers you have saved.

Stored the same way as the home page: a JSONB blob on the cafe row, so
sections can change without a database migration.

**Save Linux settings** commits this tab. **Preview the page** opens the
public page in a new tab.

Two things live outside this tab: ticking **Linux help at this session**
on your events, and ticking **Helps at Linux sessions** on your
volunteers. See the
[Linux Repair Cafe guide](./08-linux-repair-cafe.md).

## Tab: Gallery

Photo grid that appears on the home page. Each photo:

- Is uploaded immediately on file-pick (no separate save button).
- Auto-resized to 1800px longest edge, JPEG, ~85% quality.
- Has an **optional caption** (saved on blur).
- Can be reordered with the up/down arrows.
- Can be deleted with the bin (asks for confirmation).

Multiple files at once supported. There's no save button on this tab —
all changes are immediate.

## Tab: Check-in & preferences

Three controls that change the customer check-in flow.

| Setting                           | What it does                                                |
| --------------------------------- | ----------------------------------------------------------- |
| Allow customers to skip "before" photo | Adds a Skip button on step 4 of check-in. Useful at busy events or for items that look unremarkable. |
| Show optional contact field       | Whether step 2 of check-in includes a phone/email field. Off by default — many cafes don't need it. |
| Data retention period (days)      | How long after the event date customer name/contact is kept. Default 365. Used by the GDPR purge. |

**Save preferences** commits this tab.

## Tab: SEO & analytics

How your home page appears in search engines, social shares, and (optionally) what
analytics service collects pageviews.

### Search engine listing

| Field            | Notes                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Page title       | What shows in browser tabs and Google. Blank → auto from name + tagline. ~60 chars works best. |
| Meta description | Snippet under the title in search results. Blank → uses Short description. ~150 chars works best. |

### Icons & share image

| Field             | Notes                                                          |
| ----------------- | -------------------------------------------------------------- |
| Favicon           | Tab icon. PNG / JPEG / WebP / SVG. Square, 32–256px.            |
| Open Graph image  | What previews in WhatsApp, Facebook, Slack, X, etc. ~1200×630. Falls back to your banner if blank. |

Both are uploaded immediately when you choose a file (no separate save).

### Plausible analytics (optional)

Privacy-friendly, cookie-free, GDPR-compliant analytics. Both fields
must be filled to enable.

| Field        | Notes                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| Site domain  | The domain you registered in Plausible (e.g. `repaircafe.example.org`).|
| Script URL   | `https://plausible.io/js/script.js` for managed Plausible. Self-hosted? Use your own URL. |

If both are blank, **no analytics tag is rendered at all**. There's no
Google Analytics integration, but you can paste any compatible
`https://…/script.js` URL — it's allow-listed in the CSP.

**Save SEO & analytics** commits this tab.

## Tab: GDPR

One button: **Purge expired PII now**. Finds every job whose retention
date has passed and blanks out the customer name + contact fields. If you
run a [Linux Repair Cafe](./08-linux-repair-cafe.md), it clears the same
fields on expired Linux install records too, so both are forgotten on the
same day.

Run this on a schedule that matches your retention promise — monthly is
a sensible default for most cafes. Logged in the audit log with the row
count.

See [Reports & GDPR](./06-reports-and-gdpr.md) for the full GDPR story.

## Tab: Sharing our numbers

Whether this cafe sends the project a short daily summary of what it has done.
Nothing is sent until somebody chooses to, and you can change your mind at any
time.

| Setting | What it does |
| --- | --- |
| **Share our numbers** | Sends counts only: repairs done, sessions held, which version you run. No names, no text anybody typed, nothing about visitors or volunteers. |
| **Show us on the community map** | Also sends your cafe's name and web address, so you appear on the public map of repair cafes with your figures beside you. |
| **See exactly what would be sent** | Shows the real message, built from your own data. Not an example. |
| **Delete everything you hold about us** | Asks the project to delete its copy, and stops sending. |

The summary goes once a day and always carries running totals, so a session
offline changes nothing: the next message carries the full picture.

Someone running this server can rule it out entirely with `TELEMETRY_DISABLED=true`
in the environment, in which case this tab says so and the choices do nothing.

## Tab: About

Just version / source info. No settings.

## Top right: Users…

Shortcut to `/admin/repairers` — see [Skills & repairers](./03-skills-and-repairers.md).

## What's *not* on Settings

A few admin areas live in their own pages in the sidebar instead of in
Settings:

- **Skills** — `/admin/skills`
- **Venues** — `/admin/venues`
- **Repairers** (users) — `/admin/repairers`
- **Events** — `/admin/events`
- **Live board** — `/admin/board`
- **Statistics** — `/admin/stats`
- **Repairs** (history + CSV) — `/admin/repairs`

This is intentional — those things are big enough to deserve their own
spaces, not buried under Settings tabs.
