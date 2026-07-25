# Changelog

Notable changes to the Repair Café Hub. Newest first.

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
