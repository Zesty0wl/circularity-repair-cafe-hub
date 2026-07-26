# Proposal: work out CO₂ savings instead of guessing them

**Status:** proposal, nothing built yet
**Written:** 26 July 2026

## The problem

We do not calculate CO₂ at all. There is no formula anywhere in the code.

When a repairer closes a job they see an optional box labelled "Environmental
saving (kg, optional)". Whatever number they type goes straight into
`repair_jobs.environmental_saving_kg`. Every "CO₂ saved" figure on the site is
then just:

```sql
SUM(environmental_saving_kg) FILTER (WHERE status = 'completed')
```

Our own documentation is honest about this. `docs/06-reports-and-gdpr.md` says
"The CO₂ figure is whatever your repairers have entered", and the repairer guide
tells volunteers "your best estimate... If you've no idea, leave it blank."

Three things are wrong with that:

1. **We ask volunteers to do life cycle assessment in their heads.** Nobody can
   estimate the embodied carbon of a toaster while a queue builds up behind
   them. Two repairers fixing the same kettle could reasonably enter 0.5 and 50.
2. **The field is optional, and we encourage leaving it blank.** So the total is
   a sum over an unknown subset of repairs. It always understates, by an amount
   nobody can state.
3. **We publish it as if it were measured.** The home page shows "CO₂ saved:
   412 kg" next to real counts like repairs done and volunteers. A visitor has
   no way to know one of those numbers is a pile of guesses.

There is also a mismatch in the question itself. We never record what an item
weighs, so there is nothing to convert from. The repairer is being asked for the
answer, not for an input.

## What we should do instead

Ask the volunteer something they can actually answer, then do the arithmetic
ourselves:

> **What kind of thing is it?** → a list, e.g. "Kettle", "Laptop", "Bicycle"

Everything else follows from that.

## The data

The Restart Project publishes exactly the reference data this needs, gathered
from community repair events like ours.

- **Fixometer reference data (2021)**, The Restart Project
- <https://zenodo.org/records/5900046> (DOI 10.5281/zenodo.5900046)
- Licence: the spreadsheet states **CC BY-SA 4.0**. The Zenodo record says
  CC BY 4.0. We should follow the stricter reading and attribute plus share
  alike, and ask them to confirm.
- Categories follow the **Open Repair Data Standard (ORDS)**, which is the
  common language for community repair data. Using it also means our data could
  be contributed back one day.

It gives, per category, an average product weight and an average pre-use CO₂e
(the carbon emitted making and shipping the thing). 59 of 61 categories have
usable data, from 495 products.

A sample of what it holds:

| Category | Avg weight | Pre-use CO₂e | Products behind it |
|---|---|---|---|
| Laptop medium | 1.83 kg | 265.5 kg | 64 |
| Tablet | 0.77 kg | 114.5 kg | 43 |
| Mobile | 0.15 kg | 51.1 kg | 37 |
| Vacuum | 6.80 kg | 36.0 kg | 7 |
| Kettle | 1.25 kg | 44.3 kg | 5 |
| Clothing/textile | 0.75 kg | 20.3 kg | 32 |
| Toaster | 1.47 kg | 8.1 kg | 3 |
| Bicycle | 15.10 kg | 149.6 kg | 1 |

Note the spread. A laptop is worth about thirty toasters. That is why our
current skill categories cannot carry these numbers: "Electronics" covers both a
phone charger and a desktop computer, which differ by a factor of over a
thousand. We need a separate, finer list for the carbon figure.

## The formula

The Restart Project's own methodology, which we should copy rather than invent:

```
CO₂e prevented (kg) = pre-use CO₂e of the product (kg) × displacement rate
```

**The displacement rate is 0.5.** This is the important part, and the part most
likely to be dropped by accident. It does not assume a repair saves the whole
carbon cost of a new item. It assumes a repaired thing lives about 50% longer
than it otherwise would, so the repair displaces half a new purchase. Their
words: "Our biggest, and most necessary, assumption."

So a repaired laptop counts as **133 kg**, not 265 kg. A kettle is **22 kg**.

We should store the rate as a setting rather than hard-coding it, so a cafe can
be more conservative if it wants, and so the number is visible rather than
buried.

## Changes to the data

### New table: `co2_factors`

Seeded from the Fixometer data, one row per ORDS category.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `ords_category` | text | e.g. `laptop_medium` |
| `label` | text | e.g. "Laptop (medium)" |
| `group_label` | text | e.g. "Computers and home office" |
| `avg_weight_kg` | numeric | for display, and for sanity checks |
| `pre_use_co2e_kg` | numeric | the figure the sum is built on |
| `sample_size` | int | how many products it came from |
| `is_active` | bool | so a cafe can hide ones it never sees |

`sample_size` matters. Some categories rest on a single product (Bicycle,
Sewing machine, Coffee maker). We should show that rather than hide it.

### Changes to `repair_jobs`

| Column | Purpose |
|---|---|
| `co2_factor_id` | which category the volunteer picked |
| `co2_saving_kg` | the calculated result, written at completion |
| `co2_saving_source` | `calculated`, `manual` or `none` |

Keep `environmental_saving_kg` exactly as it is. It becomes the manual override,
and old data stays readable.

Storing the result rather than computing it on read matters: if the reference
data is updated in 2027, last year's reported totals should not silently change
underneath a cafe that has already published them.

## Changes to the screens

**At check-in.** The visitor already describes the item and picks a skill
category. Add the item type here, filtered by the skill category they chose, so
the list is short. This is the right moment because the visitor knows what their
thing is.

**At completion.** The repairer sees the calculated figure, already filled in:

> Fixing this saves about **22 kg of CO₂e**
> Based on a kettle (44.3 kg to make, halved because a repair extends its life
> rather than replacing it outright). [Change]

They can override it. Overriding sets `co2_saving_source = 'manual'` so we can
tell the two apart later.

**In admin.** A settings page showing the displacement rate, a link to the
source, and the ability to switch the whole feature off for cafes that would
rather not publish a carbon figure at all.

## Migrating what we already have

Do not touch it. Existing `environmental_saving_kg` values become
`co2_saving_source = 'manual'`, and are still counted.

They should not be quietly relabelled as calculated, because they are not.

## Saying it honestly

This is the part I would not want to skip. Once the number is calculated it will
look more authoritative, and it is still an estimate built on averages and one
large assumption.

Suggestions:

- Label it **"CO₂e avoided (estimated)"**, not "CO₂ saved".
- Put a short note under the figure, linking to the method and the source.
- On the stats page, show what share of completed repairs actually have a
  figure. "412 kg, from 78% of repairs" is a more honest sentence than "412 kg".
- Keep using the word "about".

## What I would want decided before building

1. **Do we ask at check-in or at completion?** Check-in gives better coverage,
   because every item gets a type whether or not it is fixed. It also adds a
   step to a flow visitors do themselves on a phone.
2. **Do unfixed items count?** The Restart Project counts successful repairs
   only. We currently do the same by filtering on `status = 'completed'`. I
   would keep that.
3. **How much of the 61-category list do we show?** The full ORDS list is long
   for a repair cafe that mostly sees kettles and lamps. We could seed all of
   it and let a cafe hide the ones it never sees.
4. **Is 0.5 the right displacement rate for us?** It is The Restart Project's
   figure and it is defensible. Changing it would need its own justification.
5. **Do we contact The Restart Project?** Worth doing anyway, both for the
   licence question and because they may welcome another group using it.

## Rough size

| Piece | Effort |
|---|---|
| Extract and seed the reference data | small, the spreadsheet parses cleanly |
| Migration and schema | small |
| Calculation and storing at completion | small |
| Item type picker at check-in | medium, it touches the visitor flow |
| Admin settings and stats changes | medium |
| Wording across the public pages | small |

The largest risk is not technical. It is picking a category list that volunteers
can use quickly at a busy table. That is worth testing with one real session
before building the rest.

## Sources

- [Fixometer reference data, The Restart Project (Zenodo)](https://zenodo.org/records/5900046)
- [Why we collect repair data, The Restart Project](https://therestartproject.org/fixometer-2/why-we-collect-repair-data/)
- [Measuring impact, Restarters Wiki](https://wiki.restarters.net/Measuring_impact)
- [Open Repair Data Standard](https://openrepair.org/open-data/open-standard/)
