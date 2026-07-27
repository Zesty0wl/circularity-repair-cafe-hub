# Changelog

Notable changes to the Repair Café Hub. Newest first.

## 1.4.1 — 27 July 2026

### Changed

- The Worldwide map now uses the OpenStreetMap look: real roads, parks, rivers
  and place names in colour, instead of the near-black style it inherited from
  the globe. It is easier to tell where a café actually is.
- The map, the panel beside it and the band they sit in are now light, to match
  the rest of the site. The dark backdrop was there to make the globe look like
  a planet in space, which no longer means anything.
- Cafés are green pins and groups are green circles. Our own café is orange, so
  it stands out from the rest without needing a different shape.
- The tiles come from CARTO rather than from OpenStreetMap's own servers. Those
  servers run on donated capacity, and the people who look after them ask that
  software handed out to other people does not point at them. Any café can
  install this hub, so every copy would have been doing exactly that.

## 1.4.0 — 27 July 2026

### Changed

- The Worldwide page now shows a flat map instead of a 3D globe. The globe was a
  nice idea but it did not load reliably. It needed WebGL, a 14 MB runtime, its
  own background workers, and a looser security policy than the rest of the
  site. When any one of those was missing, visitors got an empty box. The flat
  map is drawn with Leaflet, which the home page already uses, and it needs none
  of those things.
- Everything the globe could do, the map still does. Cafés that sit close
  together are grouped into one numbered circle, clicking a circle zooms in and
  splits it up, search and "Find cafés near me" move the map, and your own café
  is marked with a white pin.
- Cafés that sit close together are grouped a little more loosely than before,
  so the circles no longer overlap each other across western Europe.
- Only the café you have picked keeps its name on screen. Showing every name at
  once made a busy town unreadable.
- The site now runs under one strict security policy, with no exceptions. The
  Worldwide page used to be allowed to run code built from strings, because the
  globe could not work without it. Nothing on the site needs that any more.

### Added

- The Worldwide page links to the shared figures for this software, so visitors
  can see how many other Repair Cafés use it and what they have repaired
  between them.

### Removed

- CesiumJS, and the 14 MB of runtime files that were copied into the site at
  build time.

## 1.3.0 — 27 July 2026

### Added

- The Repair guides page now opens with something on it. It shows nine guides
  the repair community has just finished or updated, so the page looks ready
  rather than empty, and there is something to browse for anyone who does not
  yet know what to search for. They are fetched when the page is built, so they
  are there the moment it loads and a search engine can see them too.

### Notes for people running this

- The newest guides on iFixit are not all fit to show. Of the fifty most
  recently updated, thirty-two were unfinished drafts, over half had no
  photograph, and two were flagged by iFixit as describing something improper.
  So the list is filtered: no drafts, nothing marked for deletion or improper,
  nothing missing a picture, English only. One page of fifty reliably yields
  more than the nine needed, and the result is cached for a day, so the page
  costs one call to iFixit however many people visit it.

## 1.2.0 — 27 July 2026

### Added

- **Settings now tells you whether your numbers are actually being counted.**
  The project checks each hub by fetching its public address, and a hub whose
  address is wrong would otherwise send happily for months while its figures
  never appeared anywhere. Sharing our numbers now shows either "your numbers
  are counted" or the reason they are not, along with the address it tried.
  The commonest cause is a public address saved as `http://127.0.0.1:5026`,
  because setup was done down an SSH tunnel.
- Your hub can now prove it is real. It serves a small public endpoint,
  `/api/public/telemetry`, carrying the install id the collector already knows
  plus the same counts your site publishes anyway. The collector fetches it and
  checks the id matches, so only a hub genuinely running at your address is
  counted in the community figures. Nothing new leaves your building: the id
  identifies an install to us and means nothing to anybody else, and every
  figure is already on `/api/public/stats`.
- The endpoint answers `404` when you have not agreed to share, so switching
  telemetry off also stops it answering.

## 1.1.0 — 27 July 2026

### Added

- Your hub can now send the project a short summary of what you have achieved,
  once a day, if you choose to. It is how we can finally show what community
  repair adds up to across every cafe running this. The setup wizard asks, with
  the offer already ticked, and shows you the exact message it would send,
  built from your own data rather than an example.
- Counts only: repairs done, sessions held, which version you run. No names, no
  text anybody typed, nothing at all about visitors or volunteers. There is no
  field for free text anywhere in the message, so nothing personal can travel
  even by accident.
- You can also choose to appear on a public map of repair cafes with your
  figures beside you. That one is a separate tick, and starts unticked, because
  it puts your cafe's name on a page we run.
- A new "Sharing our numbers" tab in Settings to change your mind, see the exact
  message, or ask us to delete everything we hold about you.

### Notes for people running this

- **Nothing is sent until somebody says yes.** Upgrading an existing cafe sends
  nothing: a quiet card appears on the dashboard offering the choice, and it can
  be dismissed. It comes back once after each upgrade, never more often.
- `TELEMETRY_DISABLED=true` in the environment rules it out for the whole
  install before anyone is asked, for anyone running this on someone else's
  behalf.
- Summaries go to `repaircafetelemetry.bzwrd.co.uk`, changeable with
  `TELEMETRY_ENDPOINT`. The collector is MIT-licensed and holds no personal data.
- Six additive columns on `cafes`, all defaulting to off. The install id is a
  random UUID that identifies nothing but the install.
- The collector is a separate open-source project:
  [circularity-repair-cafe-collector](https://github.com/Zesty0wl/circularity-repair-cafe-collector).
  Read it before deciding whether to switch this on.

### Fixed

- Every container reported its version as `0.0.0`. The version is read from the
  root `package.json`, which is not copied into the runtime image, so the
  lookup always fell through to its fallback. Backups recorded `0.0.0` in their
  manifest, and the new upgrade prompt could never have noticed an upgrade,
  because the version it compares against never changed. The build now writes
  the version into the image, and `APP_VERSION` in the environment overrides it.

### Notes on releasing

- **Bump the version in `package.json` for every release.** The prompt that
  offers telemetry to an existing cafe fires once per version. A release that
  does not move the number means no cafe is ever asked again.

## 2026-07-26 (later the same day)

A big release in three parts: photos of your sessions, a carbon figure that is
looked up rather than guessed, and a map of the Repair Cafes near you.

### Added

**Photos**

- Every session now has its own photo gallery. Repairers and admins can add
  photos from a phone or a laptop, and they appear on that session's page on the
  public site. Volunteers get a new "Photos" page in their own area: pick the
  session, add the photos, done.
- Photos taken during a repair can now be shown too. They stay private until an
  admin picks them out, one at a time or all at once, because they are pictures
  of someone else's belongings.
- Any photo from a session can be starred to bring it into the main gallery on
  the home page, so the site fills up on its own as volunteers add photos.
- Past events now show what happened at the session: how many items came in, how
  many went home working, what kinds of thing they were, how many volunteers
  helped, and the waste kept out of landfill. No visitor names or item details
  are shown. You can turn this off under Settings, Home page.
- The list of past events now shows a photo and a count for each session.

**Carbon savings**

- The CO2 figure is now worked out rather than guessed. When someone checks an
  item in they say what kind of thing it is, and we look up what it costs the
  planet to make one. Before this, we asked repairers to estimate the carbon
  themselves, which nobody can do at a busy table, so the totals were guesses.
  Repairers can correct the item type, or type a figure over the top if they
  know better.
- New "About" page explaining how the carbon figure is worked out, with the sum
  written out, worked examples, and a plain list of what the number is and is
  not. It also says what share of repairs the total actually covers. More
  sections can be added to this page over time.
- Repairs recorded before any of this get their item type worked out for you, so
  your whole history counts towards the total. It reads what was already written
  down: the description, the brand, and the category the volunteer picked. Where
  that is not clear enough to be sure, the repair is left exactly as it was with
  the figure someone typed at the time. Nobody has to label old records by hand.

**Local cafe community**

- New "Local cafes" tab under Settings. Search the repaircafe.org directory and
  tick up to ten nearby Repair Cafes you know and want to support. With your own
  repaircafe.org page set, the list opens on your closest neighbours and shows
  how far away each one is.
- Those cafes then appear on your home page as a flat map with a numbered list
  beside it. Tap a pin to find that cafe in the list, or tap a number to move
  the map to it. Each one links to its own website and its page on
  repaircafe.org. The card only appears once you have chosen some.

### Changed

- Adding photos is now drag and drop, everywhere. Drop photos onto the page,
  paste one from your clipboard, or browse your device. Each photo has its own
  progress bar, and big photos from a phone are shrunk in your browser first, so
  they upload quickly on a hall's wifi.
- Describing a photo is now a proper job rather than a cramped text box. Click a
  photo to see it large, write the description, then step through the rest with
  Previous and Next. It saves as you go.
- Photos in the gallery can be dragged into the order you want. Keyboard users
  can Tab to a photo's grip and use the arrow keys.

### Fixed

- Plausible recorded nothing when you used the per-site script address, the one
  that looks like `/js/pa-XXXX.js`. That script has your site built into it but
  waits to be told to start, and nothing was telling it, so no visit was ever
  counted and no error said why. We now ask it to start. The classic
  `/js/script.js` starts itself and is unaffected.

### Notes for people running this

- The carbon reference data is seeded on every start, so a corrected figure
  reaches existing installs. Item types you have hidden stay hidden.
- On the first start after this upgrade, older repairs are matched to an item
  type from their description, brand and category, and their figure is worked
  out from the reference data. **Your published total will move**, usually up,
  because the figures it replaces were estimates. Repairs that cannot be matched
  with confidence are left alone. The pass runs once and never again: it writes
  a `co2.backfilled` entry to the audit log and checks for that entry first, so
  a figure a repairer types in from now on is never overwritten.
- Nothing is lost in that pass. The original typed-in number stays in
  `repair_jobs.environmental_saving_kg`, which is never written to, so it can be
  put back with a single UPDATE. See `apps/server/src/db/co2Match.ts` for how a
  type is worked out, and add words to it if your cafe sees things it misses.
- The carbon figures come from The Restart Project's Fixometer reference data,
  shared under CC BY-SA 4.0. See `docs/proposal-co2-savings.md` and
  `apps/server/src/db/co2Factors.ts`.
- The local cafes card stores only the repaircafe.org slug of each cafe you
  pick, in a new `cafes.local_cafe_slugs` column. Names, addresses and pins are
  read from the mirrored directory every time a page is drawn, so nothing here
  can go stale, and a cafe that leaves the directory simply stops appearing.
- The map uses Leaflet over CARTO's light tiles, the same tile source as the
  world globe. It is loaded in the browser only, after the page has rendered, so
  a visitor who never scrolls that far never downloads it.
- Two additive database changes are applied on start-up: a new `event_images`
  table, and two flags on `repair_images` that say who may see each photo. Both
  are idempotent, so restarting an existing install is safe.
- Session photos are written to `uploads/events/<event id>/`. Include it in your
  backups (the built-in backup already covers the whole uploads folder).

## 2026-07-26

### Added

- New "Repair guides" page with thousands of step-by-step guides from iFixit.
  Search by make and model, or start from one of the common things people bring
  in, like a vacuum cleaner or a laptop. A guide opens with its photographs,
  tools, parts and numbered steps, so you can follow it at the table, and links
  back to iFixit. The guides are written by the iFixit community and shared
  under a Creative Commons licence.
- New "Worldwide" page that connects your cafe to repaircafe.org. It shows a 3D
  globe with every Repair Café in the world on it, explains what the Repair Café
  International Foundation is, and links out to their site. You can search by
  name or town, or let the page find the cafes closest to you. Cafes that sit
  close together are grouped into one circle with a count, and clicking it zooms
  in and splits the group up, down to single cafes. Cafe names appear once you
  are close enough to read them.
- New setting under Settings, Profile: your page on repaircafe.org. Paste the
  address of your cafe's page there and your own pin is marked on the globe with
  a white marker and a ring, so visitors can see where you fit in.
- Each part of the site now has its own picture when you share a link. Paste an
  event into a group chat and you see its name, date and venue. Other sections
  get a card in your own colours, and repair guides and volunteer pages show
  their own photograph. Before this, every link looked the same.

### Fixed

- The "Their website" links on the world map went nowhere for many cafes. A lot
  of addresses in the repaircafe.org directory are written without "https://" in
  front, which a browser reads as a page on your own site.
- You could see cafes on the far side of the planet through the globe.

### Notes for people running this

- The globe is drawn with CesiumJS, which needs a looser content security policy
  than the rest of the site: it builds code from text and runs its map workers
  from memory. That looser policy is applied to the /world page only. Every other
  page, including sign-in and the admin area, keeps the strict one. See
  `apps/web/src/hooks.server.ts`.
- The container now installs a font (`fonts-dejavu-core`). Without one, the text
  in the sharing pictures cannot be drawn at all.
- CesiumJS is copied out of `node_modules` during the build rather than kept in
  the repository, so a fresh checkout needs `pnpm install` before `pnpm build`.

## 2026-07-25

### Added

- You can now install the site to a phone home screen or a desktop dock. It
  uses your cafe's own name, colour and logo, and shows a simple "you are
  offline" page when there is no connection.
- New "Our numbers" section on the home page: repairs done, CO2 saved,
  volunteers and sessions held. Turn it on under Settings, Home page. The
  figures come from your own records, and any that are still zero stay
  hidden, so a new cafe never shows a row of noughts.
- New repair status, "Awaiting return", for a visitor who is coming back with
  a part at a later session. The repair stays open, so it does not count as
  finished and does not affect your success rate. Anyone can pick it up when
  the visitor returns.

### Changed

- Redesigned the public pages so they follow one set of rules: one heading
  style, one spacing scale, and colours taken from your cafe's own two
  colours rather than a fixed palette. Every page now opens and closes the
  same way.
- The home page hero shows the next session date, time and venue, so visitors
  see it first instead of scrolling for it.
- Shortened the repeated blocks on the home page: four dates, eight photos
  and six volunteers, each with a link to the full list.
- The photo gallery has a heading and sits higher up the page.
- The events list leads each row with its date instead of repeating the cafe
  name on every line, and each row has an add-to-calendar button.
- The contact page leads with the next session and shows your donation link.
- The footer is now a dark block carrying your contact details, quick links
  and a donation link. The Circularity credit moved out of the header so your
  own name leads.

### Fixed

- "Furniture & wood" showed an empty coloured square, because the icon it
  asked for did not exist.
- Clocks and Musical Instruments both showed a spanner. Icons are now chosen
  from the category name when the stored icon is a generic one.
- The browser tab colour was the old Circularity green for every cafe, no
  matter which colour they had chosen.
- Category tiles used ten strong colours at once. They now share one
  lightness, so a row of them reads as a set.
- A map pin could be left stranded on its own line when an address wrapped,
  and a postcode could break across two lines.
- Told the browser the site only has a light theme, so it does not try to
  darken the pages by itself.

## 2026-07-11

### Fixed

- Signed-in volunteers were sent to the login page on every page refresh.
  The app now waits for the session to restore before it treats a user as
  signed out.
- Opening several tabs at once could log the user out. Refresh tokens now
  rotate at most once a day, and an old token stays valid for a short grace
  window after rotation, so tabs no longer race each other.

### Changed

- Sessions now last 365 days by default (was 30 days), and every visit
  extends them. A volunteer who uses the app at least once a year stays
  signed in. Set the `REFRESH_TOKEN_DAYS` environment variable to change
  this.
- The login page now sends users who are already signed in straight to
  their dashboard.
- Tidied the dashboards: better mobile layout, calmer colours, and a
  readable activity feed.

## 2026-07-04

- Added per-cafe branding. Fixed stats and theming. Tidied the site copy.

## 2026-06-12

- Repairers can now check in walk-in visitors.

## 2026-06-08

- Added server-side rendering and improved SEO across the site.
- Clearer labels on the public-visibility toggle.
- Admins can delete repairs. Photos are removed with them.

## 2026-06-07

- Rethemed the site to the Circularity brand.
- Redesigned the events page: compact cards that expand into a details
  modal, plus an add-to-calendar button.
