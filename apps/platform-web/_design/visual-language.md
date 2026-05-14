# Pantheon Visual Language — Contract for Wave B

**Status:** authoritative for Wave B (shared primitives build).
**Companion:** `_design/tokens.md` (the actual hex/rem table).
**One-pager intent:** read this before writing a primitive. If your primitive contradicts something here, stop and surface it as a Wave A bug.

---

## Aesthetic anchor

**Linear-base, refined dark, per-OS accents.**

Pantheon should read as "operating systems for serious work" — closer to **Linear / Cron / Raycast** than Notion / Airtable. Concretely:

- Deep, slightly blue-leaning dark surfaces (not pure black; not warm-gray).
- Restrained color — accent is one indigo, status colors are four. Per-OS accents come from `registry.ts` and only appear as identifying tints (badge background, hub icon halo, hover ring) — never as flood fills.
- Sharp typography — Geist Sans for everything, Geist Mono for tabular numbers and code only. No display font; the system gets its character from spacing + hierarchy, not from a hero face.
- Generous whitespace — comfortable density (decision 5.8), `p-5` cards, `gap-4` grids. No 4px tap-target playgrounds.
- Subtle borders — `border-subtle` everywhere by default; promote to `border-strong` only with intent.
- Purposeful motion — CSS transitions only (decision 5.3). 150ms default, 220ms for hover lifts, 0ms for things that should just snap.

The brand promise is: this is a tool the user trusts to hold serious work — not a toy that wins them over with delight. Polish reads as competence.

---

## What's tokenized (the contract)

The full table is in `tokens.md`. Wave B primitives MUST consume tokens, not raw hex. Specifically:

1. **Surfaces** — 4-step elevation: `surface-0/1/2/3`. Never write a custom dark hex.
2. **Borders** — 2-step weight: `border-subtle/strong`. Default to subtle.
3. **Text** — 3-step hierarchy: `text-primary/secondary/tertiary`. Map roles, not vibes.
4. **Status** — `positive/warning/attention/danger`. Pick by semantic, not by color preference.
5. **Accent** — `accent` (and `accent-soft` for tints).
6. **Per-OS** — `os-<slug>` for each of the 9 OS slugs.
7. **Type scale** — modular 1.20 ratio, 9 steps from `text-2xs` to `text-4xl`. Tabular nums for all numbers.
8. **Radius** — 5-step, default to `rounded-xl` for cards.
9. **Motion** — `transition` (150ms) default, `transition-slow` (220ms) opt-in.

If a primitive needs a token that doesn't exist: **stop, propose it, add to `tokens.md` + `globals.css`, then build.** No inline values.

---

## Do / Don't list

### Do

- Use `bg-surface-2` for the default card. `bg-surface-1` for a panel that holds cards. `bg-surface-3` for hover state on a card.
- Use `border border-border-subtle` as the default card border. `hover:border-accent/50` for "this is clickable" cues.
- Use `text-text-secondary` for descriptions, sublabels, helper text. `text-text-primary` for titles and key numbers.
- Use `text-text-tertiary` for `text-[10px] uppercase tracking-wide` meta labels.
- Use `tabular-nums` on every span wrapping a number that might re-render at different widths (money, counts, durations).
- Source per-OS color from the `os-<slug>` tokens — composed via `clsx` if the primitive takes a `slug` prop.
- Default to `transition` (150ms) on hover-state changes.
- Use `rounded-xl` (14px) for cards, `rounded-lg` (10px) for nested elements, `rounded-md` (8px) for buttons/inputs, `rounded` (6px) for pills/badges.
- Lean on whitespace before reaching for dividers. A `mb-5` is more refined than a `border-b border-border-subtle pb-5` in 80% of cases.

### Don't

- Don't hand-spell hex codes in JSX. Ever. `bg-[#1a1d27]` is a bug after Wave A.
- Don't reach for `text-white` on body copy — use `text-text-primary`. (Headings inside high-contrast surfaces _can_ use `text-white` for emphasis, but token-first is the default.)
- Don't introduce a new gray-blue shade. The surface ladder is locked at 4 steps.
- Don't introduce a new accent. The system has one indigo; OS accents are the only per-context variants allowed.
- Don't add a motion library. CSS transitions + View Transitions API are the contract.
- Don't reach below `p-3` on interactive surfaces. Comfortable density is the contract; density toggles are Wave E+.
- Don't write `bg-emerald-500/15 text-emerald-300 border-emerald-500/30` for status pills. Map to `positive/warning/attention/danger` with sized opacity (`bg-positive/15 text-positive border-positive/30`) so future re-tints land everywhere.
- Don't mix kebab-case and PascalCase filenames in the same wave. New primitives in Wave B = kebab-case (matches the rest of `_shared/`).

---

## Naming rules

For Wave B primitives in `_shared/views/`:

- **Component files** — kebab-case: `dashboard-widget.tsx`, `activity-feed.tsx`, `entity-search.tsx`. PascalCase used only inside `cyber/` and parts of `filmmaker/` is legacy debt; do not propagate.
- **Component exports** — PascalCase: `DashboardWidget`, `ActivityFeed`. One default-or-named export per file when possible.
- **Props type** — `<ComponentName>Props`. Co-located in the same file.
- **Tokens in code** — refer to them by their Tailwind utility name. Never `var(--color-surface-2)` in JSX style attributes. (Inside `globals.css` itself is fine.)
- **OS slug props** — always lowercase, matches `registry.ts` (`'health'`, `'maker'`, `'secure-dev'`, etc.).

---

## Per-OS accent application

When a primitive accepts an OS context, three application patterns are sanctioned:

1. **Icon halo:** `bg-os-<slug>/15 text-os-<slug>` on a small rounded-lg tile that wraps the OS icon.
2. **Hover ring:** `hover:border-os-<slug>/60` on a feature card.
3. **Badge background:** `bg-os-<slug>/15 text-os-<slug> border border-os-<slug>/30` on a small pill identifying which OS owns the entity (cross-OS surfaces).

Forbidden:
- Flood-filling a card background with `bg-os-<slug>`. Per-OS accents identify; they don't dominate.
- Setting text color directly to `os-<slug>` on a long paragraph. Save them for icons, badges, and 1-3 word labels.

---

## Loading / empty / error states

Wave B's `EmptyState` primitive is the canonical empty-state. Wave A doesn't ship it — but Wave B builds it against this spec:

- **Empty:** icon (Lucide, 24-32px, in `text-text-tertiary`) + 1-line title in `text-text-primary` + 1-2 line description in `text-text-secondary` + a primary CTA button. Optionally a secondary "import / seed sample data" link.
- **Loading:** prefer a skeleton (shimmer is OK; bouncing dots are not). Use `bg-surface-3 animate-pulse` for the shimmer card.
- **Error:** `border-danger/30 bg-danger/5 text-danger` panel + plain-language message + a retry CTA. Never expose stack traces.

---

## What Wave A explicitly leaves to later waves

- **No new primitives.** Wave A is pure token migration.
- **No layout changes.** No hub redesign, no list-page upgrade.
- **No copy edits.** Voice notes in `tokens.md` §10 inform Wave B copy choices but Wave A doesn't rewrite strings.
- **No light mode.** Theme support is dark-only per decision 5.7.
- **No animation choreography.** CSS transitions exist; nothing more.

---

*End of contract. If something in Wave B's spec contradicts this, fix the contract before fixing Wave B.*
