# Design System — decidex

## Product Context
- **What this is:** A CLI tool + MCP server that captures engineering decisions from git history and surfaces them in CLAUDE.md so AI coding tools never re-suggest rejected approaches or forget established decisions.
- **Who it's for:** Senior engineers using AI-assisted coding tools (Claude Code, Cursor, Copilot, Windsurf) who want persistent, queryable architectural memory.
- **Space/industry:** AI developer tooling — alongside Cursor, Warp, Windsurf, Pieces.
- **Project type:** npm CLI package with MCP server. Primary visual surfaces: npm/GitHub landing page, terminal output, README.

## Aesthetic Direction
- **Direction:** Industrial/Editorial Archive — git log meets field notes journal. Terse, serious, zero decorative flourishes.
- **Decoration level:** Minimal — typography and whitespace do all the work. Horizontal rules as section dividers, not color blocks. No glassmorphism, no gradient blobs, no rounded-card decorations.
- **Mood:** A tool that respects the engineer's time. Every pixel earns its place. Nothing aspirational, nothing friendly-corporate — just decisions, committed.
- **Differentiation from category:** Every AI dev tool (Cursor, Warp, Windsurf, Pieces) uses cold dark blue-black + Inter + rounded cards. decidex uses warm near-black + monospace hero type + amber accent + zero border-radius on structural elements.

## Typography
- **Display/Hero:** JetBrains Mono — monospace for headlines and product name. Signals terminal-native authenticity. Differentiates from every competitor using clean sans-serif heroes.
- **Body:** Instrument Sans — warm, readable, not Inter. 400/600 weights.
- **UI/Labels:** JetBrains Mono — all metadata, badges, section labels, CLI output, timestamps.
- **Code:** JetBrains Mono (same as display/labels — consistency throughout).
- **Loading:** Google Fonts CDN — `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Sans:wght@400;500;600&display=swap`
- **Scale:**
  - Hero/Display: clamp(32px, 5vw, 56px) — JetBrains Mono 400
  - H2: clamp(20px, 3vw, 28px) — JetBrains Mono 400
  - H3/Feature title: 18px — Instrument Sans 600
  - Body: 16-17px — Instrument Sans 400, line-height 1.6
  - Small/Meta: 12-13px — JetBrains Mono 400-500
  - Label/Badge: 11px — JetBrains Mono 500, letter-spacing 0.1em

## Color
- **Approach:** Restrained — one amber accent, warm neutrals. Color is rare and meaningful.
- **Background:** `#131110` — near-black with warm undertone (not cold blue-black)
- **Background-2:** `#1C1A17` — cards, code blocks, elevated surfaces
- **Background-3:** `#242118` — deep insets, terminal background
- **Border:** `#2E2B25` — warm gray border, used everywhere structure needs delineation
- **Text:** `#EDE8E0` — off-white with warmth, not pure white
- **Text-2:** `#A89F94` — secondary text, descriptions
- **Text-3:** `#6B6158` — muted, timestamps, metadata, placeholders
- **Accent:** `#D4953A` — amber/warm gold. Used for: decision area labels, key CTAs, confidence indicators, active states, progress bars.
- **Accent-2:** `#B87A28` — accent hover/pressed state
- **Accent-bg:** `rgba(212, 149, 58, 0.08)` — accent background tint for badges, alerts
- **Success:** `#5B8C5A`
- **Error:** `#C05858`
- **Warning:** `#D4953A` (same as accent — it's a feature of warm palettes)
- **Dark mode strategy:** This IS the dark mode. The palette was designed dark-first.
- **Light mode:** Inverted warm palette — `#F4F0EA` background, `#1C1A17` text, `#B87028` accent. All CSS custom properties swap via `[data-theme="light"]`.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:** 8 / 16 / 24 / 32 / 48 / 64 / 96
- **Max content width:** 1100px

## Layout
- **Approach:** Grid-disciplined — strict alignment, predictable hierarchy. Inspired by technical documentation.
- **Grid:** Single column with max-width. Feature grids use CSS grid with `auto-fit, minmax(300px, 1fr)` and 1px gap on `var(--border)` background (creates hairline grid lines without extra markup).
- **Section rhythm:** Sections separated by `border-top: 1px solid var(--border)` — horizontal rules, never color blocks.
- **Border radius:** `0px` on all structural elements (cards, buttons, feature cells, decision cards, stat cells, terminal blocks). `4px` on form inputs only. No "rounded pill" buttons. No bubbly corners.

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension.
- **Easing:** ease-out for entering, ease-in for exiting
- **Duration:** 120ms for state changes (color, border, opacity). No entrance animations.
- **What animates:** Button hover (bg/color), input focus (border-color), theme toggle. Nothing else.
- **prefers-reduced-motion:** Honor it — use `transition: none` for users who opt out.

## Component Reference

### Decision Card
- Background: `var(--bg-2)`, border `var(--border)`, zero border-radius
- Cards stack with `border-top: none` between adjacent cards (shared border)
- Meta row: area label in `var(--accent)`, dot separator, date in `var(--text-3)`, confidence badge
- Confidence dots: 5 dots, filled with `var(--accent)`, empty with `var(--border)`, 6×6px, square

### Badges
- Font: JetBrains Mono 11px, padding 2px 8px, zero border-radius
- `badge-accent`: `var(--accent-bg)` bg, `var(--accent)` border + text
- `badge-muted`: `var(--bg-2)` bg, `var(--border)` border, `var(--text-3)` text
- `badge-success`/`badge-error`: equivalent tint pattern

### Terminal Block
- Background: `#0D0C0A` (deeper than bg — terminal owns its depth)
- JetBrains Mono 13px, line-height 1.7
- Color roles: `t-dim` = `#6B6158`, `t-accent` = `#D4953A`, `t-green` = `#5B8C5A`, `t-red` = `#C05858`, `t-muted` = `#A89F94`

### Buttons
- `btn-primary`: `var(--accent)` bg, `#131110` text (dark text on amber — high contrast)
- `btn-ghost`: transparent bg, `var(--border)` border, `var(--text-2)` text
- `btn-danger`: transparent bg, `var(--error)` border + text
- Font: JetBrains Mono 13px, padding 10px 20px, zero border-radius

### Alert / Notice
- Left border only (2px solid semantic color) + subtle tint background
- No icon-in-circle, no right border, no top/bottom border — just the left accent line

### Stat Grid
- CSS grid with 1px gap on `var(--border)` background — hairline separators without extra markup
- Stat value: JetBrains Mono 32px weight 300 (light weight for large numerals)
- Stat label: body 12px, `var(--text-3)`

## Landing Page Plan

### Tech Stack
Pure HTML + CSS + minimal JS. Zero build step. `index.html`, `styles.css`, ~50 lines of JS (copy button + nav scroll border). Deploy as static files.

### Font Hosting
Self-host JetBrains Mono + Instrument Sans from `/fonts/`. No Google Fonts CDN. Eliminates external network dependency and FOUC risk.

### Light Mode
Dark-only at launch. Light mode (`[data-theme="light"]`) deferred to follow-up.

### Page Structure

```
NAVIGATION (sticky top, 48px)
  Left:  "decidex" — JetBrains Mono 500, var(--accent)
  Right: GitHub [btn-ghost] | npm install [btn-primary]
  Border-bottom: 1px solid var(--border) on scroll (JS toggle)
  Mobile: hide GitHub link, keep install btn
  No blur, no glass effect.

SECTION 1 — HERO
  Primary:   "AI coding tools forget. decidex fixes that."
  Secondary: "decidex extracts engineering decisions from your git history
              and surfaces them in Claude Code, Cursor, Copilot, and Windsurf —
              so your AI tools know what you've already decided, and why."
  CTA:       Terminal Block — "npm install -g decidex" with copy button
  Sub-CTA:   "or npx decidex generate — no install needed"

SECTION 2 — HOW IT WORKS
  3-step ASCII pipeline in Terminal Block:
  "git log → Claude API → CLAUDE.md / Cursor rules / Copilot instructions"

SECTION 3 — DECISIONS IN ACTION
  Static Terminal Block showing real decidex generate output from this repo.
  (Run decidex on itself — use actual output, not fictional sample.)
  Followed by the CLAUDE.md section it produced.

SECTION 4 — FEATURE GRID (CSS grid, 3-col desktop / 2-col tablet / 1-col mobile)
  Hairline separators via 1px gap on var(--border) background.
  No icons. Monospace label + 8-word max description, engineer voice.

  Incremental        Only new commits classified. Fast after first run.
  Multi-tool         Cursor rules. Copilot instructions. Windsurf. One command.
  MCP server         Claude Code queries decisions for the file you're editing.
  Local mode         Ollama. No API key. Runs on your machine.
  Secret scanning    Pre-commit hook blocks accidental secrets in .decisions/.
  Manual capture     Decisions not in git: decidex capture "No Passport.js"

SECTION 5 — STATS DEMO (Stat Grid component)
  "23 decisions. 4 areas. 12 rejected approaches on record."
  Values from actual decidex run on this repo.

SECTION 6 — INSTALL (quickstart)
  4-step copyable Terminal Blocks (npm install, export key, decidex init, decidex generate)

FOOTER
  Left: "decidex" label + MIT license badge
  Right: GitHub link + npm version badge (live from registry, client-side fetch)
```

### Interaction States

| Element | Default | Hover | Active | Special |
|---------|---------|-------|--------|---------|
| nav install btn | amber bg | `var(--accent-2)` | pressed | — |
| nav github btn | ghost | bg tint | pressed | — |
| copy-to-clipboard | copy icon | highlight border | "Copied!" | resets 2s, label flip |
| terminal demo | static | — | — | no animation |
| footer version badge | static "v1.x.x" | — | — | live npm fetch, updates client-side |

**Copy button:** Label flips from command text → "Copied!" → reverts after 2000ms. Border color: `var(--border)` → `var(--accent)` for 2s duration.

### User Journey

| Step | User does | Should feel | Design delivers |
|------|-----------|-------------|-----------------|
| 1 | Lands | "Is this legit?" | JetBrains Mono + sharp type signals craft |
| 2 | Reads hero tagline | "That's my problem" | Direct, names the pain: AI tools forget |
| 3 | Sees install CTA | "I can try this NOW" | Copyable one-command terminal block |
| 4 | Scrolls to How It Works | "Oh, that's clever" | ASCII pipeline signals technical depth |
| 5 | Sees terminal demo | "I can picture this in my repo" | Real decidex output, not contrived |
| 6 | Reads feature grid | "It does more than I thought" | 6 terse features, no marketing fluff |
| 7 | Hits install section | "Alright, let's go" | 4-step quickstart, all copyable |

**5-second visceral:** Product name + one sharp tagline. No hero image. Terminal block owns the fold.
**5-min behavioral:** They run `npm install`. Quickstart works first try.
**Landing page is acquisition-only** — optimize for first-time convert. No logged-in state.

### Responsive Specs

| Breakpoint | Changes |
|------------|---------|
| ≥1100px | Full layout, centered |
| 768–1099px | Feature grid: 2-col. Stat grid: 3-col. |
| <768px | Feature grid: 1-col. Stat grid: 2-col. Nav: product name + install btn only. Terminal blocks: horizontal scroll. Section padding: 48px → 32px. |

### Accessibility

- All interactive elements: min 44×44px touch target
- `var(--text)` on `var(--bg)`: 14.3:1 contrast — passes AAA
- `var(--accent)` on `var(--bg)`: 4.8:1 — **AA large text only**. Do not use amber for body-size text. Labels, badges, and the product name only.
- Tab order follows visual order
- Copy button: `aria-label="Copy npm install command"`
- Terminal block: `role="region"` `aria-label="Terminal output"`
- `prefers-reduced-motion`: copy button skips transition (no label animation)
- `focus-visible`: browser default ring preserved — no `outline: none`

### Anti-Slop Rules

- No stock icons in feature grid — monospace label only
- No "powerful", "seamless", "cutting-edge" in copy
- No testimonials section unless real named engineers provided
- Hero sub-copy names specific tools: Claude Code, Cursor, Copilot, Windsurf
- Feature descriptions: max 8 words, engineer voice
- Terminal demo: real output from running decidex on this repo

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-20 | Initial design system created | /design-consultation based on competitive research of Cursor, Warp, Windsurf, Pieces. Differentiated via warm palette, monospace hero type, zero border-radius. |
| 2026-03-20 | JetBrains Mono as display font | Risk taken: all competitors use sans-serif heroes. Monospace signals terminal-native authenticity for a git/CLI tool. |
| 2026-03-20 | Amber accent (#D4953A) | Risk taken: competitors use cold blue-black palettes. Warm amber stands out and fits the "editorial archive" metaphor. |
| 2026-03-20 | Zero border-radius on structural elements | Risk taken: industry default is 8-16px rounded cards. Sharp edges signal no-nonsense tool, enforce the industrial aesthetic. |
| 2026-03-21 | Static terminal demo | Animated terminals read as AI-generated marketing. Static block with real output is more credible for developer audience. |
| 2026-03-21 | Self-host fonts | Eliminated Google Fonts CDN dependency to avoid FOUC and external request overhead. |
| 2026-03-21 | Pure HTML/CSS/JS, no framework | Zero build step for a static landing page. No auth, no dynamic routes — framework adds complexity with no value. |
| 2026-03-21 | Dark-only at launch | Light mode CSS variables defined in DESIGN.md but deferred to follow-up PR. Ship clean, expand later. |
| 2026-03-21 | Real decidex output in demo | Use actual `decidex generate` output from this repo. Engineers can smell fake demos — authenticity > narrative control. |
