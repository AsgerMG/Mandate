# Design & UX guidelines

Rules extracted from a full responsiveness audit (2026-07-13) of `website/`.
Everything here was a real bug found in the shipped site, not a hypothetical —
read the "why" before deviating from a rule; it names the failure it prevents.

## The standard: one experience, not one-per-breakpoint

The site must feel equivalent on a 320px phone and a 2560px monitor — not
identical pixels, but no device where it feels like an afterthought. Concretely:

- **No hardcoded stats.** Any number that describes the corpus (source count,
  document count, etc.) is fetched from `/api/stats` at render time, with a
  non-numeric fallback ("dozens of") if the API is unreachable — never a
  literal like "1000+" in JSX. See `lib/api.ts:getStats` and its call sites in
  `layout.tsx` / `page.tsx`. The moment the corpus grows, a hardcoded number
  goes stale and someone has to remember to bump it; a fetched one never does.
- **This applies to *descriptions* of the corpus, not just counts.** About's
  "Coverage" section used to be a hand-maintained array claiming ~6 sources
  across "EU/France/Germany" with manually-set `live`/`next` flags — it was
  wrong (Bundestag DIP's "awaiting an API key" note was stale; the key had
  already been found — see decision-log.md 2026-07-09) and it drastically
  understated reality (78 real sources existed, not ~6). Fixed by adding
  `GET /api/sources` (real `Source` rows: key, name, jurisdiction, enabled,
  document count) and having the page group + count them live
  (`lib/sourceCategories.ts` maps each adapter key to a content-type category
  — that mapping is a codebase-structural fact that only changes when an
  adapter is added, not a corpus statistic, so it's fine for it to be
  hand-maintained; what must never be hand-maintained is *how many* sources
  are live or what their true status is). Genuine roadmap items (an adapter
  that doesn't exist yet) necessarily stay hand-maintained in
  `PLANNED_SOURCES` — but re-verify the *reason* stated for each against
  current reality before trusting an old note (see the entry below).
- **Re-verify a stale "blocked" note before repeating it, the same way you'd
  re-verify a stale "working" one.** Trusting "needs an API key" without
  re-checking is exactly as risky as trusting a hardcoded count — both are
  claims about state that drift. Cross-referenced `project-management/
  decision-log.md` before writing `PLANNED_SOURCES`' descriptions and it
  saved us from repeating a corrected mistake.
- **Fluid over stepped, where it's cheap.** Prefer `clamp(min, vw, max)` for
  type that scales continuously (`.hero h1`, `.masthead-brand a`,
  `.report h1`) over a fixed size that only changes at a breakpoint — it reads
  as "designed to scale" instead of "snaps at 760px."
- **Cap reading width; don't cap data width.** Body copy (`.report p/h2/h3/ul`,
  `.excerpt`) is capped at `max-width: 760px` regardless of container width —
  past ~75 characters a line gets hard to track on a wide monitor. Tables
  (`.report-table`) are deliberately left uncapped since tabular data benefits
  from the extra width, and get `overflow-x: auto` on their wrapper instead of
  wrapping cell text.
- **A short page on a tall/wide monitor needs its slack distributed, not left
  to pool.** `main { flex: 1 0 auto }` (the sticky-footer fix) means any page
  shorter than the viewport has leftover height — and since content is
  top-aligned by default, 100% of that leftover pools into one dead gap right
  above the footer on a big monitor. It reads as "the page ran out of
  content." Fix: wrap the page's first section in `.viewport-intro`
  (`min-height: calc(100vh - 100px); display:flex; flex-direction:column;
  justify-content:center`) so the slack splits above and below instead —
  disabled below 640px (see the class) since centering a too-tall block on a
  short phone screen clips it above the fold. Both `/` and `/about` use this;
  apply it to any new short/marketing page. This is *not* caught by the
  overflow check below — it's a whitespace-distribution problem, not an
  overflow — so it only shows up if you actually look at a full-page
  screenshot at a large viewport, not just check `scrollWidth`.
- **Container width isn't one-size-fits-all either.** `.container` widens from
  1160px to 1320px above 1600px viewport width — otherwise a 2560px+ monitor
  centers a relatively narrow column in a very large empty canvas, which
  reads as "doesn't use the screen" even though the column itself is properly
  centered. Reading-width caps (above) mean this is safe: wider container,
  same max line length for prose, just more breathing room for grids/columns.
- **Type itself must scale up on large monitors too, not just layout.** Every
  `font-size` in the file is a `clamp(original, ramp, original×1.22)` that
  holds flat at its original value up to 1280px viewport width, then ramps to
  +22% by 2560px (generated mechanically — see git history for the
  regex/formula, reused for consistency across ~45 declarations). Layout
  alone scaling (wider container, more grid columns) while type stays a fixed
  px is what reads as "tiny text on a big screen" — the whitespace grows but
  nothing else does. The four headings that already had their own
  mobile-shrink `clamp(min, Nvw, max)` (`.hero h1`, `.masthead-brand`,
  `.cta-band h2`, `.report h1`) plateau at their max well before 1280px (one
  as early as ~500px) and need a *second*, large-viewport-only clamp layered
  on top via `@media (min-width: 1600px)` — don't just leave them out of the
  scale because they already have "a" clamp; check where that clamp actually
  stops growing.
- **A hardcoded inline `style={{ fontSize: N }}` in JSX silently opts an
  element out of the shared type scale**, even if its CSS class already has
  the fluid `clamp()`. Found and removed two of these (`about/page.tsx`) that
  were redundant with their own class's font-size and would otherwise have
  frozen that one paragraph/heading flat while everything around it scaled —
  inline font-size overrides should be treated as a smell, not a convenience.

## Checklist for any new component

Run through these before calling a new page/section done — each one caught a
real bug during the audit:

1. **Flex rows with dynamic-length content need `flex-wrap`.** A row combining
   a variable-length title with fixed-width badges/metadata (document list
   rows, source citations) will silently force horizontal scroll on a phone if
   `flex-wrap` isn't set — the browser doesn't shrink `min-width` content, it
   overflows the viewport instead. Add `flex-wrap: wrap` on *any* flex row
   whose children's combined natural width isn't provably bounded, including
   ad hoc `style={{ display: "flex" }}` in JSX, not just CSS classes.
2. **Grid tracks: `minmax(min(Npx, 100%), 1fr)`, not `minmax(Npx, 1fr)`.**
   A bare `minmax(300px, 1fr)` is wider than a 320px phone viewport once
   padding is subtracted, and overflows. Wrapping the floor in `min(…, 100%)`
   makes it impossible for a track to exceed the container.
3. **`overflow-wrap: break-word` on anything rendering DB/user-supplied text.**
   Document titles, source labels, excerpts — content we don't control the
   length or word-breaks of. Cheap insurance against a future title with an
   unbroken long token (a URL, a hyphen-free German compound noun).
4. **Text inputs and textareas must render at ≥16px.** Below that, iOS Safari
   zooms the whole page in on focus — jarring, and it doesn't zoom back out on
   blur. This is a hard floor, not a design preference.
5. **Touch targets ≥ ~44px tall on mobile.** Chips, option-rows, and anything
   tapped repeatedly (scoping questions, filters) get extra vertical padding
   under the mobile breakpoint if their desktop padding falls short.
6. **Reused utility classes must not assume an ancestor.** `.row` was written
   as `.card .row` but also used bare inside `.source-item` (`Report.tsx`,
   `brief/page.tsx`) — outside `.card` it silently did nothing. If a class is
   meant to be generic, define it as generic; scoping it to one call site and
   reusing the name elsewhere is a trap for the next person who greps for it.
7. **Body is the sticky-footer flex column.** `body { display: flex;
   flex-direction: column }` + `main { flex: 1 0 auto }`. Without this, any
   page shorter than the viewport (an empty register, a tall monitor) leaves
   the footer stranded right under the content with a dead gap of background
   below it, instead of pinned to the viewport bottom.
8. **`justify-content: space-between` on a flex row spreads *all* children,
   not just the first/last.** Adding flex behavior to a class that's reused
   elsewhere (see #6) can silently rearrange unrelated rows — check every call
   site, not just the one you're editing.
9. **A media query that flips `flex-direction: row` → `column` must also
   reset any child's `flex-basis`.** `flex: 1 1 460px` sizes a *width* in row
   mode, but the same declaration sizes a *height* once the axis flips to
   column — About's hero+grid layout (`.lede-row`) silently forced the hero
   into a ~460px-tall box on tablet widths, well past its actual ~200px of
   text, leaving a large dead gap before the next section. Only showed up
   full-page at exactly the width where the row-to-column breakpoint fires;
   never assume a `flex: N N Npx` is safe across a direction change without
   checking a screenshot at that breakpoint specifically.

## How this was verified (repeat this for future audits)

Screenshot every page at a spread of real widths, and treat any
`document.documentElement.scrollWidth > clientWidth` as a hard failure (it
means something forced horizontal scroll):

```
320×700   — smallest common phone
375×812   — iPhone baseline
768×1024  — tablet / split-screen
1280×800  — small laptop
1920×1080 — common monitor
2560×1200 — ultrawide/4K
```

Test against real data, not the empty-corpus state — overflow bugs in list
rows and long titles only show up with actual content. Run `uv run ept serve`
+ `cd website && npm run dev`, then drive both with Playwright (`.venv` already
has it installed) rather than eyeballing a single breakpoint in devtools.

The automated `scrollWidth` check only catches horizontal overflow. It won't
catch a short page leaving a dead vertical gap above the footer on a tall
monitor — for that, actually look at a full-page screenshot at 1920×1080 and
2560×1200+, specifically on the shortest pages (`/`, `/about`).

## Deliberately not done (and why)

- **No wholesale px→rem conversion.** Would let type respond to a user's
  browser-level default font-size preference, which is a genuine (minor)
  accessibility win — but it's a large-surface change with real regression
  risk for a benefit most visitors won't notice. Revisit if an accessibility
  pass is ever explicitly scoped.
- **No sticky/collapsing mobile nav.** The masthead already fits in ~60px on
  a phone and doesn't scroll with content long enough to justify hiding it;
  add one only if the header grows.
