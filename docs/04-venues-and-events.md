# 4. Venues & events

Venues are *places* you meet. Events are *sessions* you run at those
venues. Both live in the admin sidebar.

## Venues — `/admin/venues`

The setup wizard creates one venue and marks it as your **home venue**.
The home venue:

- Is the default location for every new event you create.
- Is what shows on the public `/contact` page (address, map, notes).
- **Cannot be deleted.** If you need to delete it, mark another venue
  as home first.

### Adding another venue

Use **Add venue** in the top right. Fields:

| Field             | Notes                                                       |
| ----------------- | ----------------------------------------------------------- |
| Name              | What you call it ("Town Hall", "Library Annex")             |
| Address           | Full postal address — appears on the contact page           |
| Postcode          | Used for the map                                            |
| Map URL           | Paste a Google Maps / OpenStreetMap embed URL (optional)    |
| Notes             | Parking, accessibility, "ring the bell" etc. (optional)     |
| Set as home venue | Tick to make this the default. Unticks the previous home.   |

### Hiding a venue

You can deactivate a venue (Active toggle) to hide it from the new-event
dropdown without deleting it — useful for one-off pop-ups you don't run
any more.

## Events — `/admin/events`

Two list sections appear on this page:

- **Events** — actual scheduled sessions (one-offs and instances generated
  from templates).
- **Recurring templates** — rules that auto-generate events into the
  calendar.

### Event statuses

Every event is in one of four states:

| Status      | Meaning                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `scheduled` | Created and (possibly) published, but not yet running. Customers can browse it on `/events` if published, but the QR check-in is closed. |
| `active`    | Currently running. The QR check-in is open, the live board shows its queue, repairers see its jobs. **Only one event can be active at a time.** |
| `completed` | Marked done by an admin after the session ended.                              |
| `cancelled` | Cancelled by an admin. Hidden from the public calendar.                       |

### Creating a one-off event

**Events → New event → One-off**.

Fields:

- **Name** — e.g. "Spring Repair Cafe — May 2025".
- **Venue** — defaults to your home venue.
- **Date / start time / end time**.
- **Description** — what shows on `/events` and the home-page hero.
- **Max items** — soft cap shown on the public page (doesn't enforce
  anything; useful for managing expectations).
- **Publish** — tick to make visible on the public `/events` page and the
  home-page hero.

When you click **Create**, the system:

1. Creates the event with status `scheduled`.
2. Generates a unique check-in token.
3. Renders a QR code PNG to `/uploads/qr/<event-id>.png`.

You're then taken to the event's detail page where the QR is downloadable.

### Creating a recurring event

**Events → New event → Recurring (template)**.

Templates have the same fields as one-off events but instead of a single
date, you give a recurrence rule:

- **Frequency**: weekly / biweekly / monthly.
- **Day of week**: which day(s) of the week.
- For monthly: **Nth weekday of month** (e.g. "first Saturday", "last
  Wednesday").
- Optional **End date** to stop generating beyond a certain date.

When you save a template, the system **immediately materialises** the
next 12 months of instances (configurable via the `EVENT_GENERATION_MONTHS`
environment variable). They appear in the **Events** list as normal
scheduled events. You can edit or cancel any individual instance without
affecting the others.

If you change the template later (e.g. shift Saturday → Sunday), the
generator is re-run and any **future** instances are regenerated to match.
Past and active instances are left alone.

### Event detail page — `/admin/events/<id>`

Once an event exists, its detail page is where you do everything else:

- **Status buttons** in the top right:
  - `scheduled` shows **Start session**. It asks you to confirm first,
    explains what starting does, and offers to publish the session instead.
    Then it changes the status to `active`. Only start a session on the day.
  - `active` shows **End session**, which changes the status to `completed`.
  - **Undo start** (or **Set back to planned** for a session you already
    ended) puts a session started by mistake back to `scheduled`. It only
    shows while nothing has been recorded at the session.
  - Anything not-cancelled shows **Cancel**.
  - Always: **Clone** — make a new one-off event with the same details
    on a different date. Useful for ad-hoc extra sessions.
- **QR code panel** — image, full check-in URL, **Download PNG**, **Print
  view** (a printable poster), and **Regenerate** (creates a new
  token — old QR codes will stop working).
- **On your website** (near the top): says whether the session is on your
  public calendar, with a button to publish it or take it off.
- **Settings panel**: change the name, date, times and venue, toggle
  Published, and add admin notes.
- **Attending repairers** — tick which volunteers are coming. Used for
  attendance records and for showing "your team this Saturday" in the
  repairer view.
- **Repair jobs** — the list of items checked in for this event. Empty
  on a scheduled event; populated as customers arrive.

### The print view

`/admin/events/<event-id>/print` is a **printer-friendly poster** with
the event name, date, venue, the QR code at large size, and the check-in
URL underneath as a fallback for people without a smartphone camera.
Print on A4, stick on the door.

### Adding past sessions (`/admin/history`)

If your cafe ran before it used the hub, add those sessions and repairs from
a spreadsheet. They count in every total, chart and export, so your figures
show how long the cafe has really been running. Open **Events** and press
**Add past sessions** (there is also a link on **Statistics**).

1. **Download the sample file.** It has the right columns and a few example
   rows, in the language you are using the hub in.
2. **Fill it in.** One row is one item. The columns are Date, Venue, Item,
   Category, Brand, Fault, Outcome, Number of items, Weight (kg), Repairer
   and Notes. Only Date is required.
   - Dates are day first: `14/09/2019`. `2019-09-14` also works.
   - Outcome is **Fixed**, **Not fixed** or **Other** (advice given, needs a
     part, or not known). Common words such as "Repaired", "Yes", "No" and
     "End of life" work too, in English or French.
   - Only kept a tally? Leave Item empty and write the outcome and the
     number: a row with "Fixed" and "14", and another with "Not fixed" and
     "5".
   - A row with only a date adds a session where nothing was written down.
   - Venue can be left empty for your main venue. A venue the hub does not
     know is added as a past venue (not active).
   - Repairer is a volunteer's name or email address, as they are in the
     hub. Add former volunteers under **Volunteers** first if you want their
     repairs linked to them. You can make them inactive afterwards.
3. **Save it as a CSV file** and upload it. The hub checks the file in your
   browser and shows a preview: how many sessions and items it will add, and
   any problems. A problem marked as an error (such as a date it cannot
   read) must be fixed in the file first. A warning (such as a category it
   does not know) does not stop the import.
4. Press **Add … sessions and … items**.

Good to know:

- Imported sessions are marked as finished. They are not shown in the list
  of past sessions on your website unless you tick that box before adding
  them.
- If the hub already has a finished session on the same day, the items are
  added to that session. The preview warns you, so you can check they are
  not in the hub twice.
- Imported repairs have no visitor details, and no repair times, so they do
  not change your average repair time.
- The CO2 figure is worked out for items whose kind is clear from the item,
  brand or category, in the same way as for old repairs from a backup.
- Each file is listed under **Files you have added**. **Remove** takes away
  everything that file added, if you added the wrong file or added it twice.
- Large files are sent in small parts. If the connection drops, press the
  button again to carry on. Nothing is added twice.

### Tips & gotchas

- **Run one session at a time.** Starting session B does not end session
  A. End the active session first.
- **Publishing and starting are different.** Publish a session to put it on
  your website. Start it only on the day, when the doors open.
- **The Public URL on `/admin/settings` is baked into every QR code.** If
  you change it later, regenerate every event's QR.
- **Don't delete events.** Cancel them instead — that keeps any history
  intact.
- **Recurring template + clone is the killer combo.** Set up a monthly
  template for your regular cadence, then clone individual instances for
  occasional extras (themed events, festival pop-ups).
