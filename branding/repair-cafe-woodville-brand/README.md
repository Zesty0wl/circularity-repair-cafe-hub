# Repair Cafe Woodville - Brand Pack

A complete, dual-purpose brand system for Repair Cafe Woodville, supported by
Circularity. It is built to be read by AI coding agents and by people. Agents
get structured tokens and explicit rules. People get a visual showcase they can
open in a browser.

**Version 1.0.0 · Tagline: Toss it? No way!**

## Quick start

- **See the whole system:** open `examples/index.html` in a browser.
- **See it applied:** open `examples/event-landing.html`.
- **Point an AI agent at the brand:** give it `AGENTS.md` and `brand.json`.
- **Use in code:** import `css/repair-cafe.css` (it pulls in the tokens and the
  web font), then use the `rc-` classes. Or import `tokens/tokens.css` alone and
  build your own components on the variables.

## What is in here

```
repair-cafe-woodville-brand/
├── README.md                     This file
├── AGENTS.md                     Rules for AI agents. The contract.
├── brand.json                    The whole brand as machine-readable data
├── tokens/
│   ├── tokens.css                CSS custom properties (canonical)
│   ├── tokens.scss               SCSS variables
│   ├── design-tokens.json        W3C Design Tokens (Style Dictionary ready)
│   └── tailwind.config.js        Tailwind theme extension
├── css/
│   └── repair-cafe.css           Component and utility library
├── assets/
│   ├── logos/                    Stamp, wordmark, white variants, Woodville
│   │                             lockup, Supported by Circularity
│   └── icons/                    Nine line icons plus a sprite sheet
└── examples/
    ├── index.html                Visual showcase of the full system
    └── event-landing.html        A real page built from the system
```

## Colour, in one line each

- **Orange `#ED6A42`** primary brand colour. Accent and graphics only, never
  body text on white.
- **Navy `#2D2E82`** secondary brand colour and the text workhorse.
- **Ink `#231F20`** near-black for long body copy.
- **Sky `#698AC6`**, **Sand `#DBC19A`**, **Stone `#E6E2DB`** supporting neutrals.
- **White `#FFFFFF`** surfaces and reversed logo.

## Type

Hanken Grotesk throughout. Titles are Black (900), UPPERCASE only. Body is
Light (300). In titles, the numeral 1 is written as a capital I.

## Two things to decide

1. **Navy or violet.** The guidelines name navy as the secondary colour, but the
   Woodville wordmark the designer supplied uses electric violet `#9300FF`. This
   pack keeps navy as canonical and offers violet as an optional Woodville accent
   through the `.rc-theme-woodville` class. Pick one direction so the brand stays
   consistent, then update `brand.json` and remove the other note.
2. **Outlined logo masters.** The recreated logo SVGs render their text in the
   live web font. For print and production, ask the designer for outlined vector
   files so nothing depends on the font loading.

## House style

No em dashes. Warm, practical, plain-spoken copy that leads with the benefit to
people: new skills, money saved, less waste, community.
