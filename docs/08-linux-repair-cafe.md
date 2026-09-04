# Linux Repair Cafe

A Linux Repair Cafe helps people move an ageing computer to Linux instead of
throwing it away. This guide explains what it is, how to switch it on, and how
to run it alongside your normal sessions.

The feature is **off until you turn it on**. Nothing about Linux appears on your
site or in your admin area until you do.

---

## Why bother

Microsoft stopped supporting Windows 10 on 14 October 2025. Home users can pay
for security updates until 12 October 2027, and after that nothing. Millions of
computers that still work perfectly well are now called too old, and most of
them will go in a bin.

Linux is a free operating system. It runs happily on machines that Windows 11
refuses, and it keeps getting updates for as long as somebody uses it. Putting
Linux on an eight-year-old laptop can give it another five years of life, at no
cost to the owner.

It fits a repair cafe exactly. Somebody arrives with something that works but
has been declared obsolete, and volunteers help them keep it. The only real
difference from a normal repair is that the problem is software, not hardware.

You can read about the wider movement at
[repaircafe.org](https://www.repaircafe.org/en/linux-repair-cafe/).

---

## It is not a separate event

This matters, so it is worth saying plainly. Linux help is **an extra you offer
at your normal repair sessions**, at the same place and the same time. Most
cafes run it at every session, on a table in the corner.

You do not create a different kind of event. You tick a box on the sessions
where Linux help is available, and the site tells visitors about it.

---

## Switching it on

Go to **Admin → Settings → Linux Repair Cafe** and tick
**We are a Linux Repair Cafe**.

That immediately adds:

- a **Linux Repair Cafe** menu item on your public site,
- a public page explaining what it is,
- a card on your home page linking to that page,
- a **Linux** section in your admin sidebar.

The page comes pre-written in plain English. You can use it as it stands, or
rewrite every word of it. Press **Preview the page** to see it as a visitor
would.

### Two things to do next

**1. Tick the sessions.** Go to **Admin → Events**, open a session, and tick
**Linux help at this session**. If your cafe runs on a repeating schedule, edit
the repeating event instead and tick it there, so every future date gets it.

Until you do this, visitors cannot see when to come, and you have nowhere to
file an install.

**2. Mark your volunteers.** Go to **Admin → Repairers**, open each person who
helps with Linux, and tick **Helps at Linux sessions**. They are then listed on
the public page, so a nervous visitor can see a face before they come.

This is deliberately separate from **Skills**. Skills are the kinds of thing
somebody mends. Helping a person move to Linux is a different job, and a
volunteer may do one and not the other.

---

## Writing your page

Everything under **Settings → Linux Repair Cafe** is yours to change:

| Section | What it is |
| --- | --- |
| Menu item | What the menu link is called. Rename it if your town calls it something else. |
| Top of the page | The big heading and the line under it. |
| Card on your home page | The short explanation most visitors read first, and the button label. |
| What a Linux Repair Cafe is | The opening explanation on the page. Blank lines start a new paragraph. |
| How it works | Numbered steps showing what to expect on the day. |
| What to bring | Bullet points. Start each line with `• `. |
| FAQs | Questions and answers, shown as a list people can open. |
| Our numbers | Whether to show how many computers you have saved. |

Leave any section blank and it disappears from the page.

### Please keep the backup warning

Installing Linux **erases the whole computer**. The default "What to bring"
text says so, and so does the first FAQ. If you rewrite them, keep that warning
somewhere obvious. Somebody losing twenty years of family photographs because
the page did not say clearly enough is the one bad outcome this feature can
have.

---

## On the day

Run it like any other table. A useful shape:

1. **Let them try it first.** Have a laptop already running Linux for people to
   sit at. Nobody should agree to change their computer before they have seen
   what they are agreeing to.
2. **Check the backup.** Before anything else, ask what they have backed up and
   where. If they have not, do not install. Show them Linux from a USB stick
   instead and ask them to come back next time with a backup.
3. **Install it with them, not for them.** Let them watch and ask questions.
   They have to live with this machine afterwards.
4. **Set it up and show them round.** Wifi, email, printer, browser, and where
   their files went. Tell them how to reach you if they get stuck.

Bring a few USB sticks with a Linux installer on them, a wired network cable,
and patience. An install usually takes about an hour.

---

## Writing up what happened

After the session, go to **Admin → Linux** and press **Record an install** for
each computer that came to the table. It takes about a minute each, and it is
what every figure on your Linux page is built from.

You record:

- **Which session** it came to.
- **What the computer is**, for example "Dell Latitude E7450", plus roughly how
  old it was.
- **What it ran before.** Windows 10 is listed on its own, because that is why
  most machines arrive.
- **Which Linux went on**, for example "Linux Mint 22".
- **How it went.** This is the important one:

  | Outcome | Means |
  | --- | --- |
  | Linux installed | Linux is now the only system on the machine. |
  | Installed alongside the old system | Linux and the old system, side by side. |
  | Tried it from a USB stick | They had a look. Nothing was changed. |
  | Advice only | You talked it through. The machine went home as it was. |
  | Could not be done | The machine could not run it, or it went wrong. |

  The first two count as a success in your figures. The rest are recorded
  honestly and do not.

- **Who did it.**
- **A CO2 figure**, picked from a short list of computer types. This uses the
  same reference data and the same sum as a repair, so your Linux total and
  your repair total can be added together. It is only counted when the computer
  actually went home running Linux.
- **Visitor details and notes**, both optional. See below.

Anything you get wrong can be corrected later with the pencil button.

### Visitor details

Name and contact are optional, and most cafes will not need them. If you do
enter them, you must confirm the visitor is happy for you to keep them.

They are held for the same retention period as repair details, set under
**Settings → Check-in & preferences**, and are cleared by the same
**Purge expired PII now** button under **Settings → GDPR**. Leave both fields
blank and nothing personal is stored at all.

The notes field is a good place for something like "needed Sage, which does not
run on Linux, so we left Windows on it". No visitor name is needed for that to
be useful next time.

---

## Your figures

**Admin → Linux** shows, for the period you choose:

- how many computers you saw, and how many went home running Linux,
- how many people you advised without changing anything,
- how many sessions and volunteers were involved,
- **what people ran before**, which is the number funders and journalists ask
  for, because it shows how much of this is Windows 10,
- **which Linux they went home with**,
- how many each volunteer did.

Because Linux help happens at an ordinary session, these figures also appear on
that session's own report under **Admin → Statistics**, next to the repairs, and
on the public page for a past session.

**Export (CSV)** gives you the lot as a spreadsheet. Visitor names are
deliberately left out of the export: a report about how many computers were
saved has no business carrying them.

---

## Switching it off

Untick **We are a Linux Repair Cafe** and everything disappears from the public
site and the admin area at once.

**Nothing is deleted.** Your records, your page wording and your ticked sessions
all stay exactly as they were. Turn it back on and everything is there again.
This is safe to use if you want to pause over the winter, or if you are not
ready to publish yet.

You can also write your whole page first and leave the switch off until you are
happy with it.

---

## Common questions

**Do we need to be a "registered" Linux Repair Cafe?**
No. This is a way of running your existing cafe. If you want to join the wider
movement and appear on their map, see
[repaircafe.org](https://www.repaircafe.org/en/linux-repair-cafe/).

**What if only some of our sessions have a Linux person?**
Tick only those sessions. The public page lists just the dates where help is
available, and the home page card shows the next one.

**Should we record a laptop we only gave advice about?**
Yes. Record it as "Advice only". It is real work, it shows in your figures as
people advised, and it stops your install rate looking artificially perfect.

**Can a repairer record an install, or only an admin?**
The Linux section is in the admin area, so an admin or super admin. A repairer
can tell an admin what happened, or be given an admin account.
