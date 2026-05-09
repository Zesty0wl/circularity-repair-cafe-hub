# 5. Running an event day

The day-of guide. By the time you're here, you should have:

- Set up your branding and home page.
- Added your repairers as users (and sent them their reset links).
- Created the event in `/admin/events`.
- Printed the QR poster from the event detail page.

If anything in that list is missing, jump back a guide.

## Before customers arrive

### 1. Bring up the event

Open `/admin/events`, click your event, then **Activate** in the top
right. The badge changes from *scheduled* to *active*. From this moment:

- The check-in URL on the QR code starts working.
- The live board (`/admin/board`) shows this event's queue.
- Any logged-in repairer sees this event's jobs on `/repairer`.

You can only activate one event at a time. If you forgot to **End event**
on the last one, the system will refuse — go and end it first.

### 2. Stick the QR poster on the door

You printed this at `/admin/events/<id>/print`. Anywhere customers will
see it: the entrance, the welcome desk, near the kettle. Have a few extra
copies handy in case one walks off.

A **fallback URL** is printed under the QR — for people whose phones can't
scan QR codes, they can type it in.

### 3. Open the live board on the big screen

Open `/admin/board` on whatever big screen / TV / projector you have.
This is **the** thing volunteers and customers will look at all day.

The board has a small toolbar at the top — once you've set things how you
want, hide the toolbar to maximise the display:

| Control       | What it does                                                              |
| ------------- | ------------------------------------------------------------------------- |
| **Sound**     | Plays a short chime when a new job arrives. Browsers block sound until you click "Enable" — do this first. |
| **Fullscreen**| Goes proper full-screen, hiding browser chrome. Press **F11** or **Esc** to leave.  |
| **Wake-lock** | Stops the screen going to sleep mid-event. Works on most modern browsers. |
| **Zoom +/−**  | Scale the cards (0.6× – 1.4×). Use to fit "about ten cards" on whatever screen you have. |
| **Auto-page** | If there are more cards than fit, auto-scroll between pages every 10–30 seconds. |

New jobs are highlighted **yellow** for a few seconds when they appear,
so volunteers spot them immediately.

### 4. Open the repairer view (optional)

If you'd like a separate volunteer-facing screen at the welcome desk,
sign in as a repairer and open `/repairer`. This shows just the work
queue with **Accept** buttons — handy as a tablet/phone view at the desk.

## During the event

### What customers do

A customer scans the QR poster (or visits the URL) and walks through
four steps:

1. **Welcome screen** — confirms the event details, name of your cafe,
   venue, date.
2. **Personal details** — name (required), optional contact (only shown
   if you've enabled the contact field in Settings → Check-in &
   preferences), and a **GDPR consent tickbox**.
3. **Item details** — what the item is, what's wrong, brand (optional),
   skill category (optional but very helpful for grouping).
4. **Photo** — they take a "before" photo with their phone camera. If
   you've ticked **Allow customers to skip the "before" photo step** in
   Settings, they get a Skip button.

Then a success screen with their **job number**. They show the job number
to the welcome desk and the desk hands them off to a repairer. The job
appears in *waiting* on the live board immediately.

### What repairers do

When a job appears on the board, a repairer signs into `/repairer` (if
they haven't already) and clicks **Accept** on the job. That:

- Moves it from `waiting` → `in_progress`.
- Records who accepted it.
- Shows them the full job details, photos, and a workspace for notes.

When they're done, they pick one of three outcomes:

- **Completed** — fixed it. They can record optional notes, parts used,
  and an estimated **kg of CO₂ saved** (used in the stats dashboard's
  environmental savings figure).
- **Cannot repair** — diagnosed but not fixable today. Notes explain why
  (e.g. "PSU dead, replacement obsolete").
- **Release back to queue** — couldn't get to it; another volunteer can
  pick it up.

They can also upload a "during" or "after" photo from the job page —
useful for documenting the work or for stats reporting.

### Admin overrides

From `/admin/events/<id>` and `/admin/repairs` an admin can:

- Reassign a job to a different repairer.
- Force a status change (e.g. mark `cannot_repair` if the customer left).
- Edit the customer name / contact (e.g. correct a typo before retention
  expires).
- View the **audit log** entry for any change.

## After customers leave

### 1. End the event

`/admin/events/<id>` → **End event**. The status changes to `completed`.
This:

- Stops the QR check-in URL from accepting new check-ins.
- Removes this event from the live board.
- Allows you to activate the next event when its time comes.

There's no rush — leave it active until you're certain no more items are
being worked on. You can still mark individual jobs complete on a
completed event.

### 2. (Optional) chase up "cannot repair" follow-ups

Look at the repairs list filtered to `status = cannot_repair` for your
event. These customers may want their item back, or be willing to
donate it for parts. Your repairers' notes on the job are the source of
truth.

### 3. Eyeball the numbers

Pop over to `/admin/stats` and filter to today's date. Total jobs,
completion rate, top repairers, environmental savings — useful both for
your own morale and for any funder / council report you have to write.
See [Reports & GDPR](./06-reports-and-gdpr.md) for the full reporting
guide.
