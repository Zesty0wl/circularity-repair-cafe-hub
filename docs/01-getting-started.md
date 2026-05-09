# 1. Getting started

This guide gets you from a freshly-installed container to a fully-configured
admin account in about ten minutes.

## Before you start

You need a working install of the hub running on a server somewhere. If you
don't have one yet, follow the [Quick start](../README.md#quick-start-docker)
in the main README.

You also need a way to reach it from your laptop's browser:

- **Easy / temporary**: an SSH tunnel — `ssh -L 5026:127.0.0.1:5026 user@your-server`,
  then open <http://127.0.0.1:5026> on your laptop.
- **Production**: a public hostname pointing at your server, with a reverse
  proxy in front (see [README → Deploying behind Cloudflare + nginx](../README.md#deploying-behind-cloudflare--nginx)).

## The setup wizard

The first time anyone visits your hub, they'll be redirected to `/setup`.
This is a one-time wizard that creates your super-admin account and the basic
record of your cafe. **Do this yourself** — whoever finishes the wizard
becomes the super-admin (the only role that can create more admins).

The wizard collects:

| Step | What it asks for                                                  |
| ---- | ----------------------------------------------------------------- |
| 1    | Your **name, email, password** (your super-admin account)         |
| 2    | Your cafe's **name, tagline, and short description**              |
| 3    | Your **home venue** — name, address, postcode                     |
| 4    | The **public URL** people will use to reach the site              |

Passwords must be at least 10 characters with at least one uppercase letter,
one lowercase letter and one digit.

When you click **Finish**, the system creates your user, your cafe record,
your home venue, and seeds 10 default skill categories you can edit later.

## What just got created

After the wizard, the database has:

- **One user** — you, with the role `super_admin`.
- **One cafe row** — name, tagline, description and contact details from the
  wizard. Most other fields are blank, ready for you to fill in.
- **One venue** — your home venue, which will be the default location for
  every event you create.
- **Ten skill categories** — Electronics, Small appliances, Clothing &
  textiles, Bicycles, Furniture & wood, Toys, Tools, Jewellery, Books & paper,
  Other. You can rename, hide, reorder or delete any of these in
  `/admin/skills`.
- **A default home page** — placeholder copy for the "What & Who",
  "How it works", "What to bring" and FAQ sections, ready for you to edit.

## Signing in afterwards

From now on, the front page is your public site. To get back into the admin
area, go to `/login` and use the email + password you set during setup.

If you forget your password, **another super-admin or admin** can generate a
1-hour reset link for you from `/admin/repairers`. There is deliberately no
self-service "forgot password" flow — repair cafes typically have multiple
admins, and a reset link kept inside the admin team is more secure for a
small organisation than a public email-reset endpoint.

## Your first look around

Once signed in, you'll land on **Dashboard** (`/admin/dashboard`). The left
sidebar gives you everything else:

- **Dashboard** — at-a-glance numbers and the next event.
- **Events** — one-off events and recurring templates. *([guide →](./04-venues-and-events.md))*
- **Repairs** — the full job history with filters and CSV export. *([guide →](./06-reports-and-gdpr.md))*
- **Live board** — the full-screen shop-floor display. *([guide →](./05-running-an-event.md))*
- **Repairers** — your volunteers and admins. *([guide →](./03-skills-and-repairers.md))*
- **Statistics** — charts of impact, success rate, top repairers, environmental savings.
- **Skills** — the categories of items you repair. *([guide →](./03-skills-and-repairers.md))*
- **Venues** — places where you run sessions. *([guide →](./04-venues-and-events.md))*
- **Settings** — branding, home page editor, photo gallery, check-in
  preferences, SEO/analytics, GDPR. *([guide →](./07-settings-reference.md))*

## Suggested next steps

Most cafes follow roughly this order:

1. **Make it look like yours** — upload a logo, banner and favicon, set your
   primary colour. *([Branding & home page →](./02-branding-home-page.md))*
2. **Customise the home page text** — change the "What & Who", FAQs, etc.
3. **Set up your skill categories** — hide any that don't apply, reorder so
   the most common come first.
4. **Add your other venues** if you run in more than one place.
5. **Invite your repairers** as user accounts so they can log into the
   repairer view on the day.
6. **Create your next event** (or a recurring template if you meet regularly).
7. **Print the QR poster** for that event from `/admin/events/[id]`.

When the day comes, see [Running an event day](./05-running-an-event.md).
