# AGENTS.md - Repair Cafe Woodville brand rules for AI agents

You are generating a website, email, document, poster, app screen, or component
for **Repair Cafe Woodville**, a volunteer-run community repair event supported
by the charity **Circularity**. Follow these rules exactly. When a request
conflicts with a rule here, ask before overriding it.

This file is the contract. `brand.json` is the same information as structured
data. `tokens/` holds the values in every format. `css/repair-cafe.css` holds
ready-made components. Prefer reusing those over inventing new styles.

---

## 1. Golden rules (do not break these)

1. **Never hard-code hex values.** Reference a token: `var(--rc-orange)`,
   `text-rc-navy`, `$rc-navy`, or `{brand.navy}`. If you need a colour that has
   no token, stop and use the nearest token instead.
2. **Orange is accent only.** `#ED6A42` never sets body text, paragraphs, or
   small labels on a white background (3.12:1, fails WCAG AA). Use it for
   buttons, icons, rules, highlights, and large graphic shapes.
3. **Body text is navy or ink.** Use `--rc-color-text` (`#231F20`) for long
   copy and `--rc-color-text-strong` (`#2D2E82`) for headings and emphasis.
4. **Titles are Hanken Grotesk Black, UPPERCASE only.** Never set a title in
   lowercase, and never set body copy in the Black weight. Body copy is Hanken
   Grotesk Light (300).
5. **In titles, write the numeral 1 as a capital I.** Brand quirk from the
   guidelines. "PART I", "No I.", not "Part 1". This applies to display titles
   only, not body copy, dates, or data.
6. **No em dashes anywhere.** Use commas, colons, or full stops. This is a firm
   house style rule.
7. **White logo on dark or busy backgrounds.** Never place the navy or two-tone
   logo on a photo or a coloured panel where contrast drops.
8. **Ship WCAG 2.1 AA.** Visible keyboard focus, real labels, respects
   `prefers-reduced-motion`, works down to a 360px viewport.

---

## 2. Colour

Load `tokens/tokens.css`. Use the **semantic** tokens in UI, not the raw palette.

| Token | Value | Use for |
|---|---|---|
| `--rc-color-accent` | `#ED6A42` orange | buttons, icons, highlights, large graphics. **Not text on white.** |
| `--rc-color-brand` / `--rc-color-text-strong` | `#2D2E82` navy | headings, emphasis, primary text, links |
| `--rc-color-text` | `#231F20` ink | body copy (best contrast) |
| `--rc-color-text-muted` | `#6B6864` | captions, meta |
| `--rc-sky` | `#698AC6` | supporting decorative blue, large blocks only |
| `--rc-sand` | `#DBC19A` | warm accent, dividers, panels. Not text. |
| `--rc-stone` | `#E6E2DB` | neutral backgrounds and surfaces |
| `--rc-white` | `#FFFFFF` | surfaces, reversed logo |

**Contrast cheatsheet (measured):** navy on white 11.51:1, ink on white 16.3:1,
white on navy 11.51:1, white on orange 3.12:1 (large bold text only),
white on violet 5.7:1.

**Orange button rule:** white text on an orange fill only reaches AA-large.
Keep the label bold and at least 16px, or use the navy button
(`.rc-btn--brand`) when the control is small or the surrounding text is dense.

### Colour deviation you must know about
The official guidelines name **navy `#2D2E82`** as the secondary brand colour.
The Woodville wordmark supplied by the designer instead uses **electric violet
`#9300FF`**. This pack treats navy as canonical. Violet is available as an
**optional** location accent via `--rc-violet` and the `.rc-theme-woodville`
class, which re-points brand and heading colour to violet without changing the
orange accent. Do not mix navy and violet in the same lockup. If the brief does
not specify, default to navy.

---

## 3. Typography

Web font: `Hanken Grotesk` from Google Fonts, weights 300, 400, 500, 600, 900.
Import URL is in `brand.json.typography.webfontSource`. Always include the
fallback stack from `--rc-font-body`.

- **Titles:** `.rc-title` (Black 900, uppercase, tight leading, navy).
  Sizes: `--hero`, `--1`, `--2`, `--3`, `--4`.
- **Eyebrow / label:** `.rc-eyebrow` (Black, uppercase, wide tracking, orange).
- **Lead paragraph:** `.rc-lead`. **Body:** default or `.rc-body` (Light 300).
- **Meta / caption:** `.rc-small` or `.rc-meta`.

Do not use the Black weight for anything except titles and eyebrows. Do not
apply `text-transform: uppercase` to body copy.

---

## 4. Components (reuse, do not reinvent)

All live in `css/repair-cafe.css`, all classes are prefixed `rc-`. Wrap any
page region in `.rc-scope` (or `<body class="rc">`) to inherit base type and
colour.

- Buttons: `.rc-btn` plus `--primary` (orange), `--brand` (navy),
  `--outline`, `--ghost`, `--inverse`; sizes `--sm` / `--lg`.
- Badges: `.rc-badge` plus `--navy` / `--sky` / `--sand` / `--solid`.
- Cards: `.rc-card` plus `--warm` / `--navy` / `--accent-top`.
- Event card: `.rc-event` with `.rc-event__date`.
- Callouts: `.rc-callout` plus `--info` / `--success` / `--warning` / `--danger`.
- Forms: `.rc-field`, `.rc-label`, `.rc-input`, `.rc-select`, `.rc-textarea`.
- Nav / footer: `.rc-nav`, `.rc-footer`.
- Layout: `.rc-container`, `.rc-section`, `.rc-grid` (`--2` / `--3` / `--auto`),
  `.rc-stack`.

If you build in a framework without this CSS, read the class definitions and
reproduce the same token references.

---

## 5. Logos

Files in `assets/logos/`. Choose by context:

- **Stamp** (`repair-cafe-stamp.svg`): compact, social avatars, favicons,
  stickers. Min width 48px.
- **Wordmark** (`repair-cafe-wordmark.svg`): headers, print. Min width 120px.
- **Woodville lockup** (`repair-cafe-woodville-primary.png` or
  `repair-cafe-woodville-wordmark.svg`): the location-specific mark.
- **White variants** on dark or busy backgrounds.
- **Supported by Circularity** (`circularity-supported-by.svg`): place at the
  foot of marketing material, especially anything used off-site.

Clear space around any logo equals the height of the R in REPAIR. Never
stretch, recolour outside the brand palette, add effects, or place a
non-white logo on a photo.

Note: the recreated SVG logos set their text in the live web font. For print or
production hand-off, request outlined vector masters from the designer so
rendering does not depend on the font loading.

---

## 6. Icons

Line style, 1.75px stroke, round caps, `currentColor` so they inherit colour.
Set nine: `wrench, coffee, heart, lego, tshirt, bicycle, plug, smiley, picnic`.
Use individual files in `assets/icons/` or the sprite `icons-sprite.svg`:

```html
<svg class="rc-icon" aria-hidden="true"><use href="assets/icons/icons-sprite.svg#rc-icon-wrench"></use></svg>
```

Wrap in `.rc-icon-circle` to get the orange ring treatment from the guidelines.
Give meaningful icons a label; mark decorative ones `aria-hidden="true"`.

---

## 7. Voice and copy

Warm, practical, community-minded, encouraging, plain-spoken. Lead with the
human benefit: skills, savings, less waste, people together.

**Do:** active verbs, sentence case in body, specifics about what happens at an
event, an inviting call to action.
**Do not:** lecture or shame people for throwing things away, use corporate
jargon or hype, or use em dashes.

Approved calls to action: "Book a repair", "Bring something to fix",
"Volunteer as a repairer", "Find your next event".

Tagline: **Toss it? No way!** Use it as a hero line or a stamp, not as body
copy. Key messages are in `brand.json.voice.keyMessages`. Reuse their substance,
reword freely, keep the meaning.

---

## 8. Before you ship, check

- [ ] No raw hex. Every colour is a token.
- [ ] Body text is ink or navy, never orange, sand, or stone.
- [ ] Titles are uppercase Black; numeral 1 written as I in titles.
- [ ] Orange buttons use bold labels 16px or larger, or use the navy button.
- [ ] Correct logo variant for the background; white logo on dark or busy.
- [ ] Supported by Circularity present on marketing material.
- [ ] Keyboard focus visible; images have alt text; reduced motion respected.
- [ ] Layout holds at 360px wide.
- [ ] No em dashes.
