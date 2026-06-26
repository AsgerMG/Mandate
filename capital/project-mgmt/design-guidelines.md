# Design Guidelines

## Visual Identity

### Color Palette

**Primary: EU Flag Blue**
- Hex: `#003399`
- Pantone: Reflex Blue C
- Use for: navigation accents, active states, links, chart highlights, borders on focus, primary action buttons
- Do not use as a large background fill

**Background**
- Primary background: `#FFFFFF` (white)
- Secondary / card surfaces: `#F8FAFC` (near-white)
- Section dividers: `#E2E8F0` (light grey)

**Accent: EU Yellow**
- Hex: `#FFCC00`
- Use sparingly: a single call-out label, a badge on a featured data point, or a selected-state indicator on the map
- Never use for body text; contrast against white is insufficient for accessibility
- One instance per screen is a maximum

**Text**
- Foreground: `#0F172A` (near-black)
- Muted / captions / labels: `#64748B`
- Avoid pure `#000000` for running text

**Semantic sector colours** (charts only, not UI chrome)
- Life sciences: `#7B3F61`
- Cleantech: `#2D6A4F`
- Deep tech: `#1F3A93`
- Defense: `#5C2A2A`
- Digital: `#D97706`
- Space: `#1B263B`
- Other: `#6B7280`

---

## Typography

### Typeface
Use Georgia (serif) for all body text and prose. It is the closest freely available match to the house style of The Economist and the Financial Times. Fall back to `"Times New Roman", serif`.

For UI labels, data labels, navigation, and captions: `system-ui, -apple-system, sans-serif`.

For numbers in KPI cards and tables: `ui-monospace, "SF Mono", Menlo, monospace` with `font-variant-numeric: tabular-nums`.

### Scale
- Section headers (h2): 1.25rem, weight 600, sans-serif
- Article headers (h1 within prose): 1.75rem, weight 700, Georgia
- Body text: 1rem / 1.7 line height, Georgia
- Captions, labels, metadata: 0.75rem, sans-serif, letter-spacing 0.05em (use uppercase sparingly for category labels only)
- KPI values: 1.75--2rem, monospace, tabular-nums

---

## Writing Style

### Model publications
Write as if filing for The Economist or the Financial Times data desk. Sentences should be declarative and specific. Data precedes interpretation.

### Rules
- **No em-dashes.** Use a colon, a full stop, or restructure the sentence.
- **No en-dashes** in running text (use "to" for ranges: "2021 to 2024", not "2021--2024").
- **No exclamation marks.** Ever.
- **No rhetorical questions.** State the finding.
- Spell out numbers below ten; use numerals from 10 upward.
- Always include units: EUR, %, companies -- never naked numbers in body text.
- Use the active voice. "Germany received 2,633 grants" not "2,633 grants were received by Germany."
- Prefer shorter sentences. A sentence over 30 words should be split.
- Avoid hedging phrases: "it appears that", "it seems", "arguably". State the finding or do not state it.
- Country names in full on first mention within a section; ISO-2 codes acceptable in charts and tables only.

### Forbidden words and phrases
- "significant" (use a number instead)
- "leverage" (as a verb)
- "ecosystem"
- "space" (as a metaphor for market)
- "stakeholders"
- "synergies"
- "innovative" / "innovation" unless quoting a programme name
- "deep dive"
- "moving the needle"

---

## Layout

- Maximum content width: 80ch for prose, 1280px for data-heavy pages
- Use a single-column layout with clear vertical rhythm; avoid multi-column body text
- KPI grids: 3 to 6 columns on desktop, 2 on mobile
- Charts: titled in title case; axis labels in sentence case; always include a unit
- No decorative borders, shadows, or gradients on data elements -- only on UI surfaces (cards, navigation)
- Avoid centering body text; left-align everything except numerals in table cells

---

## Charts

- Use EU blue (`#003399`) as the primary series color
- Use EU yellow (`#FFCC00`) as a second series color only if a second series is unavoidable and distinct from sector colors
- Every chart must have a title and an axis unit
- No chart should require a legend if a direct label is possible
- Tooltip text follows the same writing rules as body copy
- Pie charts: label slices directly if there are fewer than 5; use a legend only if 5 or more
