# 3. Skills & repairers

This guide covers the two pieces of "who repairs what": the **skill
categories** that classify items, and the **repairers** (your volunteers)
who pick up the jobs.

## Skill categories

A skill category is a kind of thing you fix — *Electronics*, *Bicycles*,
*Clothing*, etc. They're used in three places:

- On the **customer check-in** form, so people can pick what kind of item
  they brought (optional but encouraged).
- On the **public `/skills` page**, where each category shows the
  volunteers who handle it.
- On a **repairer's profile**, so admins know what to assign them.

### Defaults that get seeded

When the setup wizard runs, ten categories are created with sensible icons
and colours:

| Category              | Icon         |
| --------------------- | ------------ |
| Electronics           | cpu          |
| Small appliances      | plug         |
| Clothing & textiles   | shirt        |
| Bicycles              | bike         |
| Furniture & wood      | armchair     |
| Toys                  | toy-brick    |
| Tools                 | wrench       |
| Jewellery             | gem          |
| Books & paper         | book-open    |
| Other                 | help-circle  |

### Managing categories — `/admin/skills`

From the **Skills** page in the admin sidebar you can:

- **Add** a new category — name + optional description.
- **Rename** by clicking on the category name.
- **Hide / show** by clicking the green/grey *Active* badge. Hidden
  categories don't appear on the public `/skills` page or on the check-in
  dropdown, but jobs already classified with them keep working.
- **Reorder** by drag-and-drop using the grip handle on the left. The
  order set here is the order people see everywhere.
- **Delete** with the bin icon. **This will fail if any existing job uses
  the category** — hide it instead in that case.

### Tips

- Reorder so the categories you handle most often appear at the top — it
  speeds up check-in.
- *Other* is a safety net: don't delete it unless you're sure every item
  fits another category.
- Keep the list short (8–12 categories). Long lists slow people down on
  the check-in screen.

## Repairers and admins

Volunteers, admins, and you all share the same **Users** table — what
makes them different is their **role**.

### The three roles

| Role          | What they can do                                                          |
| ------------- | ------------------------------------------------------------------------- |
| `super_admin` | Everything. Can create/promote/demote other admins. Created by the setup wizard. There can be more than one — see below. |
| `admin`       | Everything except create/promote `super_admin` users.                     |
| `repairer`    | Sign in to `/repairer`, view the active event's queue, accept jobs, upload photos, mark complete. |

### Adding a new repairer (or admin) — `/admin/repairers`

Click **Add repairer** in the top right.

1. Fill in **display name**, **email**, **role** (default Repairer), and an
   optional **bio** (shown on the public `/skills` page).
2. Tick the **skills** they'll handle — these match the categories from
   `/admin/skills`.
3. Save. The system creates the user and **immediately gives you a
   one-hour, single-use reset link** for them.
4. Send the link to the new user via your usual channel (email, signal,
   WhatsApp, paper note). They click it, set a password, and they're in.

If the link expires before they use it, generate a new one from their
profile page (Reset link button on the row, or **Generate password reset
link** inside their profile).

### Editing or deactivating a repairer

Click their name in the list. From there you can:

- Change name, email, **role** (admins can promote to admin; only super-admins
  can promote to super-admin), bio, skills.
- Toggle **Active** off — they keep all their history but can't sign in
  any more. Use this when someone steps away.
- **Delete** entirely — only do this for accounts created in error. If
  they've already done repairs, deactivating is the right answer.
- **Generate password reset link** — for password recovery, role hand-overs,
  or if they're locked out.

### Passwords

- Min 10 characters, must include an uppercase letter, a lowercase letter
  and a digit.
- There's no self-service "forgot my password" — admins generate a
  one-hour reset link and send it through whatever channel suits them.
  This is intentional: it keeps reset paths short and traceable, and there's
  no need to ship transactional email.

### Promoting yourself a deputy

Don't be the only super-admin. Create or promote at least one other
person to `super_admin` so you're not the single point of failure on event
day. Bus-factor matters even for repair cafes.

### What repairers see

When a logged-in user with the `repairer` role visits the site, they land
on `/repairer` (not `/admin`). They see:

- The currently **active** event's queue (all `waiting` jobs).
- Whatever they've already **accepted** (in-progress jobs).
- A button to **release** a job back to the queue if they need to swap.
- For each job they're working on: customer info, item, fault, before
  photo, and a form to add notes/parts/CO₂-saved when marking it
  complete or "cannot repair".

See [the repairer guide](./repairer-guide.md) for the full event-day flow
from a volunteer's point of view.
