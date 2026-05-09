# Repairer guide

A short, friendly guide for the volunteers doing the actual fixing.
Print this and stick it on the wall, or send the link to new starters.

## Signing in

1. Go to your cafe's website (e.g. `https://repaircafe.example.org`).
2. Click **Sign in** in the top right.
3. Enter your email + password.

If you've never signed in before, the cafe organiser will have sent you
a **one-time setup link** (`/reset/<token>`). Click it, choose a password,
and you're in.

If you've forgotten your password, ask an organiser to **send you a new
reset link**. There's no self-service password reset.

## What you see

Once you're signed in you land on **`/repairer`** — your dashboard for
the day.

### Top of the page

- **Active event card** — name of the event, venue, time, and four big
  numbers: **Waiting**, **In progress**, **Done**, **Couldn't repair**.
- **My stats card** — your lifetime totals. Number of repairs you've
  done, your success rate, and the category you've worked on most.

If the card says *No active event*, it just means an organiser hasn't
flipped today's event to `active` yet. Grab a brew.

### My active repairs

Anything **you** have already accepted but not yet completed. Click any
card to jump back into it.

### The queue

Below that, the list of jobs at this event. Use the buttons at the top
to filter:

- **Waiting** (default) — jobs nobody's accepted yet. This is your
  shopping list.
- **In progress** — currently being worked on (yours and other people's).
- **Completed** / **Couldn't repair** — already done, for reference.

The list refreshes itself every minute. New jobs are also highlighted
yellow on the **live board** (`/admin/board`) — that's the big screen
in the room.

## Working a job

### 1. Accept

When you spot a `waiting` job you can fix, click **Accept**. That:

- Moves the job to `in_progress`.
- Records your name as the repairer.
- Drops you straight onto the job's detail page.

It also vanishes from everyone else's *Waiting* tab so two people don't
both rush at the same kettle.

### 2. The job page

You'll see:

- **Header** — job number, item description, brand, customer name,
  optional contact.
- **Fault** — what the customer told us was wrong.
- **Photos** — at minimum the customer's "before" photo. **Add photo**
  lets you add a *during* or *completed* shot from your phone or
  webcam — really useful for documenting tricky repairs and for the
  cafe's stats reports.
- **Repair details** — notes, parts used, environmental saving, outcome.

### 3. Fix it

Do the actual repair. Take an *during* photo if it's interesting.

If you can't fix it after all — say a part is needed that you don't
have, or a customer wandered off — click **Return to queue**. The job
goes back to `waiting` and another volunteer (or you, after lunch) can
pick it up.

### 4. Mark complete

Fill in:

- **Repair notes** — what was wrong, what you did. The customer might
  see this later. Be kind, be specific.
- **Parts used** — anything you swapped in (capacitor, fuse, button cell,
  thread). Optional but nice.
- **Environmental saving (kg)** — your best estimate of the kg of CO₂
  the customer just *didn't* emit by not buying a new one. Optional.
  Even rough estimates feed into the cafe's stats — see your organiser
  for typical values.
- **Outcome** — pick **Repaired successfully** or **Could not repair**.

Click **Mark as complete**. Confirm. Done. Move to the next one.

## Etiquette

- **Pick from Waiting before grabbing something else's In progress.**
  If a job is already accepted, the named repairer is on it.
- **Photos help**. Even a quick "here's the inside of the toaster" gives
  the next person a head start when they get a similar one.
- **Be honest about CO₂ savings.** If you've no idea, leave it blank —
  it's better than wild guesses.
- **Use Return to queue freely.** If you're stuck, someone else might
  not be. There's no penalty.
- **Notes are kind, not snarky.** The customer might read them later.

## My history

Click **My history** on the dashboard to see every repair you've ever
done at this cafe. Useful for end-of-year reporting, CV padding, or
just reminiscing.

## When the event ends

The organiser will mark the event `completed`. From that moment:

- The customer check-in QR stops accepting new items.
- The active event vanishes from your dashboard.
- Anything you'd already accepted is **still editable** — finish writing
  up your jobs, add late photos, etc.

Then go put the kettle on. You've earned it.
