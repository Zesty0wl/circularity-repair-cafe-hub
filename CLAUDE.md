# CLAUDE.md

Guidance for AI agents and contributors working in this repository.

## Writing style

Write in clean, clear, simple, plain English that a non-native English speaker
can easily understand. This is the house style for everything we write: the
website and app text (headings, buttons, labels, help text, placeholders, error
messages, emails), the documentation, code comments, and commit messages.

Rules:

- Do not use em dashes (`—`). Use a comma, a full stop, a colon, or brackets
  instead, or split the sentence into two. This is a firm rule.
- Prefer short sentences and everyday words. Avoid jargon, idioms, slang, and
  figures of speech.
- Say one idea per sentence, and lead with the most important information.
- Use the active voice ("Save your changes", not "Changes should be saved").
- Avoid or explain abbreviations a newcomer may not know.
- Be direct and friendly. Tell the reader what to do and what will happen next.

When you edit existing text, keep the meaning, simplify the wording, and remove
any em dashes.

## Releases

Cafes install whatever is on `main` when they update, and each hub runs on its
own Cloudflare account. So only merge finished, tested work to `main`, keep
database migrations safe to run on any older hub, and follow "Releasing a new
version" in `docs/how-it-works.md` when making a release.

## Visual design

- Never put a coloured stripe or "flash" along one edge of a card, row,
  banner or panel: not on the left, right, top or bottom. Show a status or
  category with a soft tinted background, an icon, a badge or a coloured dot
  instead. Neutral one-pixel dividers between sections are fine. This is a
  firm rule.
