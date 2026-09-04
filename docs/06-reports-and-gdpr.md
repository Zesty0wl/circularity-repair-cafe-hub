# 6. Reports, history & GDPR

After your first event you'll want to look at the numbers, export
something for a funder, and make sure customer data isn't lingering longer
than it needs to. This guide covers all three.

## Repair history — `/admin/repairs`

The full list of every job ever checked in. By default, latest first,
25 per page.

### Filtering

Above the table:

- **Event** — only jobs from a specific event.
- **Repairer** — only jobs handled by one volunteer.
- **Category** — only jobs in a skill category.
- **Status** — `waiting` / `in_progress` / `completed` / `cannot_repair` / `returned`.
- **Date range** — from / to.
- **Free-text search** — matches across job number, customer name, item
  description, fault description.

Filters combine — they all apply at once. The pagination remembers your
filters so you can flip pages without losing them.

### Columns

| Column      | Notes                                                               |
| ----------- | ------------------------------------------------------------------- |
| Job number  | The short code printed on the customer success screen.              |
| Customer    | First name / full name as supplied. Blank if PII has been purged.   |
| Item        | Free-text description from the check-in form.                       |
| Fault       | Free-text fault description.                                        |
| Category    | Skill category (with its colour swatch).                            |
| Status      | Coloured badge.                                                     |
| Repairer    | The volunteer who accepted it (blank for `waiting`).                |
| Created     | Check-in timestamp.                                                 |

Clicking any row opens the job's detail page where you can see the
photos, notes, parts list, environmental savings, and audit trail.

### CSV export

The **Export CSV** button at the top hits `/api/admin/repairs/export.csv`
with **whatever filters are currently set**. If you want everything,
clear all filters first; if you want one specific event, pick the event
filter and *then* export.

Useful for:

- Funder reports.
- Council impact statements.
- Local-authority waste-stream stats.
- Importing into Excel / Google Sheets for ad-hoc analysis.

The CSV includes job number, customer, item, fault, category, status,
repairer, event, dates, parts, notes, and CO₂. **It does not include
photo URLs** (those would expire as they reference local upload paths).

## Statistics dashboard — `/admin/stats`

The visual summary, powered by Chart.js. There's a single
**from / to date** filter at the top — defaults to "all time".

Headline numbers (the cards across the top):

- Total jobs.
- Completed.
- Cannot repair.
- Success rate (completed ÷ closed).
- Top repairer.
- Total CO₂ saved (kg).

And six charts:

- **Repairs by month** — stacked bar of completed vs cannot-repair.
- **By category** — doughnut.
- **Success rate over time** — line.
- **Top repairers** — horizontal bar.
- **Environmental savings** — kg CO₂ over time.
- **Jobs per event** — bar, latest first.

### Tips

- "Success rate" only counts jobs with a final outcome (`completed` or
  `cannot_repair`) — items still `waiting` or `in_progress` don't
  affect it. So the figure is always honest, even mid-event.
- The CO₂ figure is whatever your repairers have entered. It's a
  useful estimate, not a precise measurement — encourage volunteers to
  fill it in but don't audit them.
- Filtering by date is great for "since last AGM" or
  "this funding year" reports.

## GDPR — keeping customer data tidy

The hub stores **two pieces of personal data** about customers:

- **Name** — they have to give one to check in.
- **Contact** — phone or email, only collected if you've turned on the
  **Show optional contact field** preference (Settings → Check-in &
  preferences).

That's it. No address, no bank, no demographics. GDPR consent is captured
at check-in time as a tickbox; the consent flag is stored on the job.

### Retention period

In **Settings → Check-in & preferences**, set **Data retention period
(days)** — default 365. Every checked-in job has a `dataRetentionDate`
calculated as `event date + retention days`. After that date, the job's
name and contact fields can be purged.

### Purging

Go to **Settings → GDPR** and click **Purge expired PII now**. This:

- Finds every job whose `dataRetentionDate` is in the past.
- Sets `customer_name` and `customer_contact` to NULL on those jobs.
- Does the same to any expired
  [Linux install record](./08-linux-repair-cafe.md), which stores the same
  two fields for the same reason, so both are forgotten together.
- Logs the count and timestamp in the audit log.

The repair history (item, fault, photos, outcome, environmental savings)
is *kept* — only the personally-identifying fields are wiped. Your
historical statistics stay accurate. The same is true of a Linux record:
what the computer was and what happened to it survives, the visitor's
name does not.

> **Note**: this is a manual button, not a scheduled job. Decide on a
> rhythm (monthly? quarterly? after each event?) and put it in your
> volunteer rota or your own calendar. Future versions may automate it.

### Honouring a "right to be forgotten" request

Until automated DSAR tooling lands, you have two options.

**Redact — keeps your impact stats (usually the right choice).** This wipes
the personal data but keeps the anonymous repair record:

1. Find the customer in `/admin/repairs` (search by name or job number).
2. Open each of their jobs and **edit** the `customerName` and
   `customerContact` to blank or `redacted`.
3. Note the request and date in the job's admin notes.
4. If they want their **item photos** deleted too, remove the photos from
   the job's photos panel.

**Delete — removes the record entirely.** If they want all trace gone, open
each job and use the **Delete repair** button in the danger zone at the bottom
of the page. This permanently removes the repair record *and* its photos and
logs the deletion in the audit log. A deleted repair no longer counts towards
your statistics, so prefer redaction unless full deletion is specifically
requested.

### What's *not* personal data

The volunteer (repairer) accounts are personal data too — but they're
your volunteers, with a relationship to the cafe. Use the
deactivate / delete controls on `/admin/repairers` if a volunteer asks
to leave.

## Audit log

Every admin action — every login, status change, edit, deletion — is
recorded in the `audit_log` table in the database. There's no UI for it
yet, but if you ever need to investigate "who deleted that event?" or
"when did this user become an admin?", a quick `psql` session against
the database will tell you. Useful for trustees and for compliance.
