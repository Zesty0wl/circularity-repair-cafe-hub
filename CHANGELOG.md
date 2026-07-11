# Changelog

Notable changes to the Repair Café Hub. Newest first.

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
