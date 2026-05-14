# Pantheon Design Tokens

**Status:** authoritative — every subsequent Wave (B-E) must read tokens through this contract.
**Wave:** A (Visual Language Pass)
**Theme:** dark-only (light mode deferred per decision 5.7)
**Density:** comfortable baseline (decision 5.8)
**Source of truth:** `apps/platform-web/src/app/globals.css` `@theme` block.
**Aesthetic anchor:** Linear-base — refined dark, generous whitespace, restrained color, sharp typography. Per-OS accents read from `lib/agentic-os/registry.ts`.

This document is the human-readable index. Token names are stable contracts. If you change a hex value, change it here AND in `globals.css` AND note in a Wave E coherence-pass entry.

---

## 1. Surface palette

Four-step elevation ladder. Surfaces darken toward the canvas; panels and cards lift on top.

| Token              | Hex      | HSL                | Tailwind utility                | Purpose                                                                |
|--------------------|----------|--------------------|---------------------------------|------------------------------------------------------------------------|
| `surface-0`        | `#0b0d12` | hsl(225 18% 6%)   | `bg-surface-0`                  | Canvas / page background. Behind everything.                           |
| `surface-1`        | `#13151c` | hsl(225 17% 9%)   | `bg-surface-1`                  | Default card / panel surface.                                          |
| `surface-2`        | `#1a1d27` | hsl(226 18% 13%)  | `bg-surface-2`                  | Raised card / popover / sidebar surface (one notch lifted from `-1`).  |
| `surface-3`        | `#1f2230` | hsl(229 21% 16%)  | `bg-surface-3`                  | Hover state for `-2`, dropdown items, selected rows.                   |

**Migration mapping:**
- `#0f1117` → `surface-0` (was canvas — same role, slightly darker hex; intentional alignment with Linear-base scale)
- `#1a1d27` → `surface-2` (legacy "card surface" — kept hex stable, renamed role to match elevation ladder)
- `#161922` → `surface-1` (legacy `data-table` row hover — promoted to default card surface in new scale)
- `#1f2230` → `surface-3` (legacy "hover" — same hex, new name)

**Why four steps:** three is too few once you stack hover-on-card-on-panel; five is excessive for a dark-only theme. Four lets you compose any combo without flattening.

---

## 2. Borders

Two weights. Default is `subtle`; promote to `strong` only when separation matters semantically (e.g. dialog edge, focused input).

| Token             | Hex      | HSL                | Tailwind utility                | Purpose                                  |
|-------------------|----------|--------------------|---------------------------------|------------------------------------------|
| `border-subtle`   | `#23263a` | hsl(229 25% 19%)  | `border-border-subtle`          | Default card / divider / row border.     |
| `border-strong`   | `#363b54` | hsl(228 21% 27%)  | `border-border-strong`          | Dialog edge, focus rings, emphasized.    |

**Migration mapping:**
- `#2a2d3e` → `border-subtle` (legacy default — kept role, tightened hue to harmonize with surface ladder)

**Convention:** prefer `border border-border-subtle` over `border border-[hex]`. Borders on cards should _always_ be subtle unless a focus / hover state intentionally promotes them.

---

## 3. Text hierarchy

Three weights mapping to the importance of the content. Never use raw `text-white` on body copy — `text-text-primary` is correct and lets us tune later.

| Token             | Hex      | HSL                  | Tailwind utility            | Purpose                                                       |
|-------------------|----------|----------------------|-----------------------------|---------------------------------------------------------------|
| `text-primary`    | `#f1f3f9` | hsl(222 27% 96%)    | `text-text-primary`         | Headings, key numbers, body where contrast matters.           |
| `text-secondary`  | `#a4acbf` | hsl(223 14% 70%)    | `text-text-secondary`       | Default body text, descriptions, sublabels.                   |
| `text-tertiary`   | `#6c7589` | hsl(222 12% 48%)    | `text-text-tertiary`        | Meta labels (uppercase nav labels, helper text, placeholders). |

**Migration mapping:**
- `#94a3b8` → `text-secondary` (legacy "muted" — promoted to default body)
- `#cbd5e1` → `text-primary` for body, or kept inline where it's specifically a slate-soft tone (`text-slate-300/...` is fine to keep when intentional — see do/don't in visual-language.md)
- `#e2e8f0` → `text-primary` (legacy "foreground" — same role)

---

## 4. Accent + status

Single system accent + four status colors. Status colors are semantic — `positive` for confirmations and "good" trends, `warning` for non-blocking concerns, `attention` for things you should look at, `danger` for destructive / failed / blocking.

| Token              | Hex       | HSL                | Tailwind utility                  | Purpose                                                       |
|--------------------|-----------|--------------------|-----------------------------------|---------------------------------------------------------------|
| `accent`           | `#5b6cff` | hsl(231 100% 68%) | `bg-accent` / `text-accent`       | System accent (links, primary CTAs, focus rings).             |
| `accent-soft`      | `#3a4699` | hsl(230 45% 41%)  | `bg-accent-soft`                  | 10-15% accent tint for active-nav backgrounds, hover halos.   |
| `positive`         | `#34d399` | hsl(160 64% 52%)  | `text-positive`                   | Success, healthy trend, completed.                            |
| `warning`          | `#fbbf24` | hsl(43 96% 56%)   | `text-warning`                    | Non-blocking concern (over budget but not failed).            |
| `attention`        | `#fb923c` | hsl(27 96% 61%)   | `text-attention`                  | Items needing user attention (overdue, at-risk milestones).   |
| `danger`           | `#f87171` | hsl(0 91% 71%)    | `text-danger`                     | Destructive, failed, blocked, alerts requiring action.        |

**Migration mapping:**
- `#4361EE` → `accent` (legacy brand blue — promoted to a slightly more luminant indigo for better readability on dark surfaces while staying recognizably "Pantheon blue")
- `#00B894` → use `positive` instead (legacy green) — replace inline references at next touchpoint
- `#FDCB6E` → use `warning` (legacy amber)
- `#E17055` → use `danger` (legacy red-orange)

**Why two reds (`attention` + `danger`):** Cyber OS triage benefits from distinguishing "look at this" (`attention`, orange-leaning) from "this failed / is destructive" (`danger`, red). Without this split, every alert reads at the same intensity.

---

## 5. Per-OS accents

One accent token per OS slug. The slug → hex mapping mirrors the Tailwind palette names declared in `registry.ts` so naming stays self-consistent. Every OS hub/feature card/badge should source its accent from these tokens, never raw class names. This is the lever that lets the same primitive feel different per-OS without per-OS code branches.

| OS slug          | Registry accent | Token name           | Hex       | HSL                 |
|------------------|-----------------|----------------------|-----------|---------------------|
| `health`         | emerald         | `os-health`          | `#34d399` | hsl(160 64% 52%)   |
| `maker`          | amber           | `os-maker`           | `#fbbf24` | hsl(43 96% 56%)    |
| `research`       | sky             | `os-research`        | `#38bdf8` | hsl(199 89% 60%)   |
| `secure-dev`     | violet          | `os-secure-dev`      | `#a78bfa` | hsl(258 90% 76%)   |
| `filmmaker`      | rose            | `os-filmmaker`       | `#fb7185` | hsl(351 95% 71%)   |
| `cyber`          | red             | `os-cyber`           | `#f87171` | hsl(0 91% 71%)     |
| `autobiographer` | indigo          | `os-autobiographer`  | `#818cf8` | hsl(234 89% 74%)   |
| `business`       | teal            | `os-business`        | `#2dd4bf` | hsl(173 80% 50%)   |
| `creator`        | fuchsia         | `os-creator`         | `#e879f9` | hsl(292 84% 73%)   |

**Tailwind utility:** every per-OS token resolves to `bg-os-<slug>`, `text-os-<slug>`, `border-os-<slug>`. Wave B's per-OS-aware primitives should accept a `slug` prop and compose these utilities via `clsx` / `tailwind-merge`.

**Why these hexes:** chosen from the Tailwind 4 `-400` step for each named hue family. Reason: `-300` washes out on `surface-2`, `-500` reads as overly saturated next to text. The `-400` step gives the same readability across all 9 hues, which keeps the OSes visually balanced (nothing screams louder than its neighbor).

---

## 6. Type scale

Geist Sans (display + body) + Geist Mono (code/tabular). Pre-installed via `next/font/google` in `app/layout.tsx`.

Modular scale at 1.20 (minor third) — calmer than 1.25 (major third) for dashboard density.

| Token             | rem  | px    | Tailwind utility | Use                                         |
|-------------------|------|-------|------------------|---------------------------------------------|
| `text-2xs`        | 0.625 | 10px | `text-2xs`       | Tiny meta labels, badges, uppercase eyebrows |
| `text-xs`         | 0.75  | 12px | `text-xs`        | Helper text, table headers, captions         |
| `text-sm`         | 0.875 | 14px | `text-sm`        | Default body, form labels                    |
| `text-base`       | 1.000 | 16px | `text-base`      | Card titles, prose                           |
| `text-lg`         | 1.125 | 18px | `text-lg`        | Section headers within cards                 |
| `text-xl`         | 1.250 | 20px | `text-xl`        | Page headers (h2)                            |
| `text-2xl`        | 1.500 | 24px | `text-2xl`       | Hub titles, key numbers on widgets           |
| `text-3xl`        | 1.875 | 30px | `text-3xl`       | Hub hero numbers                             |
| `text-4xl`        | 2.250 | 36px | `text-4xl`       | Empty-state hero, marketing surfaces         |

**Line-heights:** locked tight on `2xl+` (1.15), comfortable on body (1.5), generous on prose (1.65). Defined in `globals.css`.

**Tabular nums:** mandatory on all financial/metric numbers. Use `tabular-nums` Tailwind utility on `<span>`s wrapping money, counts, percentages.

---

## 7. Spacing rhythm

Standard Tailwind 4 spacing (0.25rem base step). Density is **comfortable** — that means:

- Card internal padding default: `p-5` (1.25rem / 20px)
- Card-to-card gap default: `gap-4` (1rem / 16px) or `gap-3` (0.75rem) for tight grids
- Section-to-section vertical rhythm: `space-y-6` (1.5rem)
- Form field vertical gap: `space-y-3` (0.75rem)
- Page horizontal max-width: `max-w-7xl` for dashboards, `max-w-5xl` for content-heavy pages, `max-w-3xl` for forms

**Rule:** never reach below `p-3` (0.75rem) on interactive surfaces. Comfortable density is the contract; compact-mode is a Wave E+ user preference.

---

## 8. Radius scale

Linear-ish soft radii. Sharper than Notion (which uses 8-12px everywhere), gentler than Raycast (which mixes hard corners with pills).

| Token             | rem    | px    | Tailwind utility | Use                                  |
|-------------------|--------|-------|------------------|--------------------------------------|
| `rounded`         | 0.375  | 6px   | `rounded`        | Pills, badges, small interactive     |
| `rounded-md`      | 0.5    | 8px   | `rounded-md`     | Buttons, inputs                      |
| `rounded-lg`      | 0.625  | 10px  | `rounded-lg`     | Icon tiles, nav items, sublcards     |
| `rounded-xl`      | 0.875  | 14px  | `rounded-xl`     | Cards, panels, the default           |
| `rounded-2xl`     | 1.25   | 20px  | `rounded-2xl`    | Hero surfaces, dialogs               |

---

## 9. Motion

Decision 5.3 locked: **no motion library.** CSS transitions + the View Transitions API only.

**Default transition:** `transition` Tailwind utility = `150ms cubic-bezier(0.4, 0, 0.2, 1)`. This is what most hover states want.

**Slow transition:** `transition-slow` custom utility (added in this wave) = `220ms cubic-bezier(0.4, 0, 0.2, 1)`. Use for: card hover lift, color swap on stage change, sidebar collapse.

**No springs.** No `framer-motion`. If a future primitive _really_ needs choreographed motion (e.g. kanban drag-drop), reach for the View Transitions API or roll a `requestAnimationFrame` loop — but check with Cristian first.

---

## 10. Voice notes

Decision 5.9 locked: **friendly + plainspoken.** Informs copy in Wave B primitives.

**Do:**
- "What's open this week" — present tense, second-person implied
- "No deals yet — add one to start your pipeline." — empty states explain + invite
- "Saved." — confirmations are short

**Don't:**
- "Looks like you haven't created any deals yet!" — too chatty
- "ERROR: deal.create failed" — technical leakage
- "Slay your goals" — performative

**OS-specific tone:**
- Health / Cyber / Autobiographer: avoid wit, prefer literal. These domains touch crisis-adjacent territory.
- Maker / Filmmaker / Creator: warmth + craft language is fine.
- Business / Research: neutral, precise.

---

## 11. Quick reference — common replacements

When migrating inline hex, the lookups are:

| Inline string                          | Replace with                                            |
|----------------------------------------|---------------------------------------------------------|
| `bg-[#0f1117]`                         | `bg-surface-0`                                          |
| `bg-[#1a1d27]`                         | `bg-surface-2`                                          |
| `bg-[#161922]`                         | `bg-surface-1`                                          |
| `bg-[#1f2230]`                         | `bg-surface-3`                                          |
| `bg-[#2a2d3e]`                         | `bg-border-subtle` (rare; usually it's a border)        |
| `border-[#2a2d3e]`                     | `border-border-subtle`                                  |
| `text-[#94a3b8]`                       | `text-text-secondary`                                   |
| `text-[#cbd5e1]`                       | `text-text-primary` (or keep `text-slate-300` if it's literally slate-toned) |
| `text-[#e2e8f0]`                       | `text-text-primary`                                     |
| `bg-[#4361EE]`                         | `bg-accent`                                             |
| `text-[#4361EE]`                       | `text-accent`                                           |
| `border-[#4361EE]`                     | `border-accent`                                         |
| `bg-[#4361EE]/10`                      | `bg-accent/10` (or `bg-accent-soft`)                    |
| `hover:border-[#4361EE]`               | `hover:border-accent`                                   |
| `hover:bg-[#1f2230]`                   | `hover:bg-surface-3`                                    |

---

*End of tokens.md. Wave B reads from this. If a primitive needs a new token, add it here, in `globals.css`, then build.*
