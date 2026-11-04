# The Memo, Dreamed First

*2026-07-09. Written mid-build, on purpose: we stopped adding features to the
brief and are designing the ideal final artifact instead, then reverse-engineering
what each pipeline must supply. Method: dream the memo → annotate what powers
each section → derive the requirements → sequence.*

**Register (non-negotiable, site-wide):** public-awards intelligence. The reader
learns where, for what and how comparable entities received public capital, and
what is coming that they should position for. Never competitor-urgency, never a
race. Companies appear in tables only if they received public funding. Private VC
rounds are out of scope. No em-dashes in rendered copy.

**The two questions the memo answers, in order:**
1. *Backward (events pipeline, db.sqlite):* what have somewhat-comparable
   companies received from public institutions, through which vehicles, and what
   does that imply for how I position my own applications?
2. *Forward (intelligence pipeline, signals.sqlite):* what is changing — new
   funds, programme redesigns, people, upcoming decisions and deadlines — that
   should shape when and where I raise?

---

## Part 1 — The dream memo

Running example: **Cenotian** (Dublin, 2026, robotics-finance infrastructure,
no public funding traced yet) whose founders want to raise public capital in
**Germany, Italy and France**, not only at home. Everything below is written as
it would render. Each section carries a status tag:
`[LIVE]` exists today · `[PARTIAL]` exists, missing pieces named · `[DREAM]` not built.

---

### 1. Subject + bottom line up front `[LIVE]`

> **No public funding traced for Cenotian while Irish robotics peers already hold
> Horizon and state-aid awards.**
>
> Surveylabs (EUR 301K Horizon) and Tarracor Robotics (EUR 100K state aid) show
> the Irish door is open and fast. But your stated targets are Germany, Italy and
> France: there, the entry ticket is the national development bank layer, and the
> comparable entrants used it before touching any EU instrument.

*Powered by:* events DB self-match + peers. **Gap:** the second paragraph needs
`targetMarkets` intake (parked mid-build) and per-market peer queries.

### 2. Where you stand `[LIVE]`

One paragraph on the founder's own traced footprint (or its absence, stated as a
fact, never a scolding). Unchanged.

### 3. Comparable companies `[PARTIAL]`

The centrepiece table. Today: name, public capital traced, channel breakdown,
active years, maturity, positioning. Only publicly funded companies appear.

Dream additions:
- **Group by market** when targetMarkets is set: "In your target markets" first
  (German, Italian, French comparables), then home market, then rest of Europe.
- **Entry-path column**: the FIRST public instrument each comparable used, and in
  which year. This is the single most actionable fact for a market entrant: it
  shows the actual door, not the biggest cheque.
- **A "recent signal" footnote per comparable** when the intelligence layer holds
  one (entity-linked article within 12 months): "Wandelbots: named in BMWK
  robotics initiative coverage, March 2026."

*Powered by:* events DB (per-market peer queries, first-event-per-company),
`article_entities` join for the signal footnotes (696 articles linked, 527
mentions resolved — plumbing exists, join not written).

### 4. The capital on the table `[PARTIAL]`

Today: instrument comparison (ticket, speed, what you give up, best for),
EU-level channels only.

Dream: when targetMarkets is set, the table becomes **market-aware**: one row
per relevant national instrument per target market (KfW loan programmes,
Bpifrance i-Nov, CDP Venture / Fondo Nazionale Innovazione direct tickets)
alongside the EU rows. Every figure still code-built from curated snapshots,
never model-written.

*Powered by:* fund-processes briefs need per-country NDB snapshot files
(today one generic `national_dev_banks.md`; dream: `ndb_de.md`, `ndb_fr.md`,
`ndb_it.md`, `ndb_ie.md` with `## At a glance` blocks).

### 5. Market entry briefs `[DREAM]` — the new core section for cross-border raisers

One compact block per target market:

> **Germany.** The workhorse door is the Länder-federal state-aid layer plus KfW.
> Comparable entrants (non-German robotics companies with first German public
> money) typically entered through GBER research grants co-held with a German
> subsidiary. KfW's WIN-Initiative names growth capital for exactly this segment;
> the Deutschlandfonds co-invests up to EUR 50M per deal. What the data says:
> 14 non-German robotics companies drew first German public money since 2023,
> median first ticket EUR 640K, 11 of 14 via a German legal entity.
>
> **Italy.** CDP Venture Capital is the dominant early door (Fondo Nazionale
> Innovazione); Invitalia carries the industrial schemes. The register shows the
> Italian layer is deep (Mediocredito EUR 15B distributed) but slower. …
>
> **France.** Bpifrance i-Nov and France 2030 lines. …

Each block: the door, what comparable ENTRANTS (not incumbents) did, one stat
from the events DB, one current signal from the intelligence layer, the legal
prerequisite if any (subsidiary, co-holding).

*Powered by:* **new events queries** (first-national-event for foreign-HQ
companies = "entrant" analytics — the data exists, the query does not),
per-market digest slices (designed mid-build, parked), per-market landscape
streams (DE/FR/IE/IT registry layers now exist; IT ingestion pending).

### 6. The road ahead `[PARTIAL]`

Today: outlook (≤60 words) + 2-4 sourced watch items from the digest. Grounded,
register-clean, live-tested.

Dream:
- **Dated.** Watch items carry real dates/timeframes. (Blocker: harvest date
  extraction misses EC newsroom dates; fix `_META_DATE_RE` + fallbacks.)
- **A deadline calendar strip**: the next 2-3 concrete dates that matter for this
  founder (call cut-offs, programme launches, trilogue milestones), merged from
  (a) fund-processes deadline fields, (b) `funding_pipeline_signal` +
  `programme_policy_change` signals that carry an event date, (c) the legislative
  pipeline (ECF file milestones via OEIL/Legislative Train — needs the JS-portal
  adapters).
- **People to monitor** `[DREAM]`: 1-2 names from `stakeholder_appointment`
  signals relevant to the founder's channels ("the new EIC Fund lead", "BMWK
  state secretary for industrial policy"). 1,632 signals exist, incl. this type;
  section not designed. *Open question below: appetite + privacy posture.*
- **New funds forming** `[PARTIAL]`: Scaleup Europe Fund-style items already
  surface via topics; make "a new vehicle is forming, first close expected X"
  a recognized item shape the writer must flag when present.

### 7. Funders to engage `[LIVE]`

Per-funder: relevance, honest trade-off, next step, next deadline, comparables
using it. Works. Dream delta: when targetMarkets is set, this section must lead
with the target markets' national funders, grounded in the market-entry blocks.

### 8. Prioritised to-dos `[PARTIAL]`

Dream delta: to-dos become **sequenced against the deadline calendar** ("before
the March cut-off", "after the German entity exists") instead of P1/P2/P3 only.

### 9. Caveats `[LIVE]`

Committed-not-disbursed, coverage varies, absence is not zero. Unchanged. Add
one line when market-entry blocks render: entrant stats depend on register lag,
typically 6-18 months.

---

## Part 2 — Reverse-engineered requirements

### From the events pipeline (track 1, db.sqlite)

| # | Requirement | For section | Status |
|---|---|---|---|
| E1 | Per-market peer queries (peers in a TARGET country, not just HQ) | 3, 5 | Not built; `findPeersBySubsector` takes one country |
| E2 | **Entrant analytics**: foreign-HQ companies' first national event per country (door, year, ticket, legal-entity pattern) | 5 | Not built; data exists |
| E3 | First-instrument-per-company ("entry path" column) | 3 | Not built; one GROUP BY away |
| E4 | Per-country NDB snapshot briefs (`ndb_de.md`, `ndb_fr.md`, `ndb_it.md`, `ndb_ie.md`) with At-a-glance blocks | 4, 5, 7 | Content work, Opus-authored like existing briefs |
| E5 | Structured deadline/call registry (today deadlines live as prose in fund briefs) | 6, 8 | Design needed: source + schema |

### From the intelligence pipeline (track 2, signals.sqlite)

| # | Requirement | For section | Status |
|---|---|---|---|
| I1 | Per-market digest slices (country-filtered passages) | 5, 6 | Designed mid-build, PARKED (the rejected edit); registry layers DE/FR/IE/IT exist, IT ingestion pending |
| I2 | Harvest date extraction fix (EC newsrooms yield null dates) | 6 | Known bug, small |
| I3 | Signal→section mapping: `funding_pipeline_signal`→calendar/new funds, `stakeholder_appointment`→people, `programme_policy_change`+`regulatory_development`→road ahead | 6 | Signals exist (1,632); consumption joins not written |
| I4 | Event-date field on signals (a signal about a future cut-off should carry that date, structured) | 6, 8 | Schema + prompt change to classify_signals |
| I5 | Entity-linked "recent signal per comparable" join | 3 | Plumbing exists (article_entities), join + footnote rendering not written |
| I6 | Legislative-milestone adapters (OEIL / Legislative Train are JS portals) | 6 | Parked in registry as js_rendered |
| I7 | Standing refresh loop as one command (`make intelligence`: ingest→gate→hydrate→NER/signals→embed→digest) | all | Pieces exist, orchestration is manual |

### Cross-cutting

| # | Requirement | Status |
|---|---|---|
| X1 | `targetMarkets` intake field ("Where do you want to raise public capital?", multi-select, default HQ) | Type added to `IntelligenceRequest` (landed mid-build); panel field, pipeline consumption, api pass-through parked |
| X2 | Country scope of the news registry follows demand: IE + IT layers added; ES/NL/Nordics when target-market demand appears | Doctrine: own the map, capture-all/tailor-late |
| X3 | Hosting: local test rig now; Railway service + hosted DB (pgvector) later. Embedder protocol + BLOB storage keep the migration mechanical | Decided |
| X4 | Memo quality evaluation: extend the ≤700-word/no-hedge rubric with landscape-grounding checks (every watch item traceable to a digest line) | Not designed |

### Parked mid-build (honest state, nothing dangling silently)

Landed and kept: `targetMarkets` on the request type; IT/IE registry layers +
`it` gnews locale; research-org peer guard; extractJson hardening.
Parked (do NOT resume without this plan): digest `markets` surface, panel
multi-select, pipeline market wiring.

---

## Part 3 — Open questions (stakeholder alignment, user-flagged)

1. **Which dream sections earn their place?** The memo has a length budget
   (≤700 words of prose + tables). Market-entry blocks for 3 markets could eat
   it. Rank: market entry vs people-to-monitor vs deadline calendar.
2. **People to monitor**: appetite and posture. Naming officials from public
   sources is legitimate press-derived intelligence, but decide tone (roles vs
   personalities) before building.
3. **Entrant analytics definition**: what counts as "entering" a market — first
   event with a granting authority in that country, or first event via a local
   legal entity? (Register shows both patterns.)
4. **Per-market depth**: is one block per market enough, or does a target market
   deserve its own page/annex?
5. **Freshness promise**: what cadence does the memo claim for its intelligence
   ("corpus as of <date>")? Weekly refresh is cheap once I7 exists.

## Part 4 — Suggested sequence (not commitments)

1. **Dream sign-off**: edit Part 1 until the memo reads right. Cheapest place to iterate.
2. **Wave 1 (unlocks market entry)**: X1 intake + E1 + I1 + E3. Re-test Cenotian with DE/IT/FR.
3. **Wave 2 (the forward half earns trust)**: I2 dates + I3 signal joins + E5/I4 calendar. Road-ahead becomes dated and calendar-backed.
4. **Wave 3 (depth)**: E2 entrant analytics + E4 country briefs + I5 footnotes + people-to-monitor if approved.
5. **Continuous**: I7 one-command refresh, X4 eval rubric.
