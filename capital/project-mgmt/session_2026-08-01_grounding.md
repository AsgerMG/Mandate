# Session record, 2026-08-01 to 2026-08-02: grounding what a fund says about itself

Twenty-one commits, `afd00d9` to `24964b0`. Every number is measured against the
live corpus at the time the commit landed. Current state: 861 instruments, 742
(86%) complete on all six evidence axes (`project-mgmt/coverage.md`).

Two halves. The first named funds and gave them rules of their own. The second
found five things the corpus computed correctly that never reached a founder.

---

## 1. What shipped

### The store gap, and the statistic production was ranking on

`migrate_to_postgres.py` wrote its INSERT column list by hand and the list
stopped at `scheme_operators`. `award_p25/p50/p75`, `award_n`, `intensity_p50/n`
and the hierarchy columns were computed, exported to JSON, and never reached
Postgres. Nothing failed: `corpus.ts` SELECTed them and the self-healing DDL had
created them, so they were always NULL.

`typicalAward()` falls back to `totalEur / eventCount` when `awardP50` is
missing, so production had been ranking on the mean for as long as the medians
existed. The mean overstates by 3x or more on 11% of instruments, up to 450x.

    clean_aviation   awardP50   JSON 653,125   Postgres null
    eurohpc          awardP50   JSON 326,813   Postgres null

Measured by running the 12 archetypes twice, once with medians and once with
`awardP50` nulled: **10 of 12 archetypes rank differently, 15 published rows
change.** The statistic decides which funds a founder sees in most cases.

The instrument column list is now read from the SQLite table, as are the three
remaining copy steps (`eligibility_gates` 16 columns, `eligibility_clauses` 10,
`instrument_application` 7), through one `copy_rows` helper. None had drifted
yet. The publish prints a column count per table, so a drop is visible. Of 101
hand-written column lists in the repo, most are extractors writing a legitimate
subset; the dangerous class is a COPY step, which is supposed to carry
everything. `check_hydration_parity` is now step 7 of `make refresh`, after
`migrate_to_postgres` and before the two steps that spend money. Enumerated
CHECKs are parsed out of SQLite's DDL and mirrored into Postgres rather than
restated, after Postgres rejected two new `name_source` values hours apart.

### Names: 505 instruments sharing a display name, down to 211

| Pass | Method | Result |
|---|---|---|
| `programme_feed` | `>=80%`-dominant vote across an instrument's own events | 71 families, no fetch, no model call, EUR 1.74B |
| catalogue fetch | 99 pages from Altum, NFR, EIS, CDTI onto disk | thin: 13 of 65 NFR, 9 of 25 Altum, 16 of 49 EIS |
| model proposal | `name_from_catalogue.py`, guard enforced in code | accepted 5 of 41; 2 of the 5 were still wrong |
| `case_register` | Commission case register, per SA number | 376 of 376 schemes resolved, 430 instruments renamed |

    ambiguous families      154 -> 68
    shared display names    505 -> 211
    ambiguous euros         EUR 77.7B -> 28.4B (state-aid side)
    named from a register   36 -> 50, plus 430 from the case register

The first pass is the rule worth recording: `programme_name` was already
populated on 47,979 events, including 2,142 of NFR's 2,143. Before going back
out to a source, ask what the corpus already derives from it. Second time that
check has paid.

The model pass refused 36 of 41 proposals and was right to; the two acceptances
that were wrong reached a separate proposals file, never the corpus, which is
what made it a finding rather than an incident. Total model spend: about
USD 0.05.

The case register was reached by opening a case in a browser and reading the API
the page itself calls. It is a POST; the same URL as a GET returns HTTP 500,
which made three earlier attempts look like a dead end. Four SA numbers are
skipped by hand because their registered title describes an evaluation plan
rather than an aid scheme. Listed rather than word-matched, since a rule
matching "evaluation" would catch schemes legitimately named for it.

### What a fund says about itself

86% of publishable programmes (744 of 869) held no eligibility rule of their
own, and carried 55% of all awards. Within one regime, schemes operate under
different GBER articles: 9 distinct objectives across `satr_fr_rnd`'s 61
schemes, 8 across `satr_de_rnd`'s 985. Art. 25 is R&D project aid, Art. 22 is
start-up aid, Art. 21 is risk finance.

Per-scheme article gates are seeded from each child's own events at a `>=50%`
dominance floor. Free: the same computation that already ran one level up, with
a different grouping key. The row states what the article does to the capital
stack rather than naming it: statutory ceiling, the small / medium /
collaboration uplifts, the 80% cap, and that the rest of the project cost is the
founder's to fund. Ceilings were verified verbatim against two independent
reproductions of Art. 25, because EUR-Lex's consolidated HTML truncates before
it and the OJ PDF renders empty.

New evidence tier `register_derived` (migration 020). Filed by a granting
authority, so not a model guess, but a majority vote across awards, so not the
fund's own rule. It may be a structuring note and be retrieved; it may never
decide a verdict or appear as a judgement criterion. Six tests pin that.

Corroboration was measured, not assumed. Realised aid intensity does not exist
here: SATR publishes no project cost on any of its 122,814 events. The award
does corroborate. All 22 Art. 22 start-up schemes pay medians of EUR 172k to
700k, inside the statutory EUR 0.4M to 0.6M band. A scheme paying past the
lawful cap has its article deleted, not caveated.

The register then replaced the vote on **234 of 270 article ceilings**. Against
the inference on 274 children they agree on 44; on 161 the register is more
specific rather than contradictory (Art. 25 becomes Art. 25(2)(b), naming the
research category); 23 are genuine corrections. The 36 rows still on the vote
keep the attribution caveat. 305 `register_derived` gates were embedded (Voyage
4,274 -> 4,579), so zero attributable gates now lack an embedding.

### Closed schemes no longer proposed

Openness was judged from award recency, which is systematically wrong for state
aid: payments run for years after a scheme shuts to new applicants. Against the
register, **220 of 453 SATR children sit under a closed scheme, EUR 49.7B**, and
130 still looked current on a 2024 or 2025 award. The registered end date now
decides; recency fills in only where the register is silent (448 of 932
instruments carry one). 40 of the 220 have a running successor, recorded as
`successor_scheme` / `successor_title`, so a dead end can be shown as a
redirection. They stay in the corpus, because a closed scheme is still evidence
of what a country funded; the filter governs proposal only. Measured impact on
the briefs: none, all 12 archetypes keep identical pool sizes and row counts.

---

## 2. Five defects that passed every check

Each had correct data on one side and correct rendering on the other. What
failed was the join between them.

**(a) Award medians computed but never written to Postgres.** Wrong in
production for days while the whole suite passed, because every check except one
runs `NO_PG=1` against the JSON fallback.

**(b) Per-scheme article gates reaching zero founder-facing surfaces.** The
first version produced a label, and uncited gates are excluded from every
surface: measured, **0 of 458 carriers**. Three silent defects sat behind it.
`structuringNotes` ordered by family only, so with a cap of three a child's own
facts could never outrank three inherited regime facts.
`seed_inventory_gates`' ON CONFLICT never updated `verification_level`, and left
`gate_role` NULL, which is not neutral: `structuringNotes` skips untriaged
gates, hiding 233 correctly-seeded rules. Separately, the displayable-tier
policy existed as a TypeScript Set and a Python tuple which diverged the moment
a tier was added, so the row showed gates the embedder refused to embed.

**(c) Eight fields dropped by a hand-written row-to-entry mapping.**
`buildInstitutions()` maps `InstrumentRow` to `InstitutionEntry` by hand and
never copied `typicalAward`, `typicalAwardN`, `aidIntensity`, `aidIntensityN`,
`descriptor`, `familyName`, `judgementCriteria`, `structuringNotes`. Each is
computed upstream and declared downstream. `typicalAward` is the same median
from (a): fixed in the store that morning, and it still could not reach the page.

**(d) A "use client" component pulling `pg` and `fs` into the browser bundle.**
`app/brief/preview/page.tsx` -> `panelReport.tsx` ("use client") -> `types.ts`
(a value import, so the edge is real) -> `corpus.ts` -> `fs`, `pg`, `dns`.
`npm run build` had been failing since before the session; nothing pushed
recently had deployed.

**(e) Site-data JSON never rebuilt by the pipeline.** Renaming 121 instruments
changed `instrument_leaderboard.json`, `country_map.json` and four other derived
files, and nothing in `refresh.py` rebuilt them.

### The common shape

All five are a hand-maintained list or mapping standing between two things that
are each individually correct: a table and its INSERT, a computed field and its
renderer, a corpus and its published view, an import graph and its runtime. Both
ends pass their own checks. The mapping is permissive by construction, so its
failure mode is omission, and omission is silent. Optional fields make it legal
TypeScript; a subset column list makes it legal SQL.

Why the existing checks could not see them:

    tsc --noEmit    erases type-only edges and does not bundle
    vitest          resolves in Node, where fs and pg are real
    check_*.ts      all tsx scripts, also Node
    archetypes      assert verdicts and row counts, not what the memo renders
    parity check    compares two hydration paths equally missing (c)
    prebuild check  skips on Vercel, because db.sqlite is gitignored

The last one generalises: a guard that cannot run where it matters is not a
guard.

### What now catches each class

| Class | Guard |
|---|---|
| (a) copy-step drift | `copy_rows` derives columns from the source rows; publish prints a count per table |
| (a) store divergence | `check_hydration_parity`, 12 archetypes on both paths, step 7 of `make refresh` |
| (b) tier divergence | `lib/intelligence/evidenceTiers.json`, one definition read by both languages; six tests on what `register_derived` may do |
| (c) dropped render fields | `rowToEntry.test.ts`: every field `InstitutionsTable` reads off a row must be set somewhere in the pipeline, or the test names it |
| (d) client boundary | `check_client_boundary.ts` walks the import graph statically, failing on any real edge from a "use client" module to a Node builtin or driver |
| (e) stale site data | `build_site_data.py` is a step in `refresh.py`, after the coverage gate |

The client-boundary check is a property, not a list: server-only is decided by
reading what a module imports, so a server module written tomorrow is covered
without being registered anywhere. Verified by reintroducing the bug; it names
all three affected components and prints the exact chain to `fs`.

---

## 3. Open items

**Regime rules are still not attributed per scheme.** Every SATR regime's
eligibility rules were extracted from exactly one document and every child
inherits the lot; Germany's 81 distinct R&D schemes are all characterised by a
single BMFTR security-research Richtlinie. **453 children, EUR 77.7B, zero
holding a cited criterion of their own**; 561 of 615 children carry only
inherited criteria. The holding fix is a label: those criteria now read "State
aid regime: ...", so a hydrogen founder is not shown an automotive-competence
requirement as a condition on their fund. The label names the scope rather than
claiming "regime-wide", which would be its own unverified claim. 222 of these
rules carry a `value_spec` and can disqualify; those have
`audit_encoding_vs_reality --quarantine`, which dropped 12 this session
including a tobacco exclusion contradicted by 516 tobacco-sector awards. The
displayed criteria had no such guard, which is why they needed the label. The
real fix is attributing each rule to the scheme whose document it came from;
`source_file` records it. The case register at
`data/raw/state_aid_cases/cases.json` carries a per-scheme objective, member
state, regions, aid instruments and decision dates, and is the likely route.

**CLOSED for Altum, open for EIS (22).** The premise here was wrong: the feeds
DO carry scheme names and the extractor discarded them. Row 0 of every sheet in
Altum's recipient spreadsheet is a title row naming the programme, and the id was
built from the sheet name instead. 3,921 events backfilled, Altum collisions
22 -> 0. EIS has the same fix available (the rendered row's 6th cell) but is
blocked on identity, not data: see the addendum. EIS has a working
WordPress REST API at `https://eis.ee/wp-json/wp/v2/teenus` returning 108
service titles. Roughly twenty EIS ids have a plausible match there that needs a
leap the truncated id does not support, and those keep the measured descriptor.
A wrong name on a real public fund is worse than an ugly one, because a founder
takes it to the agency.

**The GBER Art. 107(3)(a) assisted-region uplift is deliberately unencoded.**
Two sources disagree on its size, 25pp against 15pp. Recorded as `pp: null` with
the conflict stated rather than encoded at either value; it needs the Official
Journal. Two further uplifts from Regulation (EU) 2021/1237 are agreed and also
unencoded, deliberately: omitting an uplift understates the ceiling, and
understating is the safe direction, since a founder who plans against less
public money over-raises privately, which is recoverable.

**Innovasjon Norge, Bpifrance and CDP Venture Capital are left alone.** The
first two return 403 bot blocks, the third a Radware CAPTCHA. Getting past any
of them means impersonating a browser. Recorded in `seed_agency_routes.py` so
nobody re-researches them and quietly crosses the line. 14 of the remaining
ambiguous families sit behind these blocks.

---

## 4. The verification standard that changed

Defects (c) and (d) were found by generating a real brief on the live site in a
browser and reading it. At that moment 115 tests, 12 archetypes, contracts,
vocab, regions, theme index, payload and cross-store parity were all green, and
they stayed green after the fixes, because none of them was looking at the thing
that was broken.

Stated plainly: **no automated check in this repo caught the two defects that
mattered most to a founder, and none of them could have.** The memo rendered a
row reading "DE · GBER Art. 25 (R&D aid)" with no ceiling, no typical award, no
intensity and no "What we can check" block, while every assertion in the suite
passed.

The standing rule from this session: a change to what a brief shows is not
verified until a real brief has been generated and read. `rowToEntry.test.ts`
and `check_client_boundary.ts` catch the next instance of each class, but they
exist because a human looked at the output first. The tests are downstream of
the reading, not a substitute for it.

---

## Addendum: the later half of the session

Written after the sections above, which stopped at the region filters. Numbers
re-measured, not carried forward.

### The Commission's case register

Every SATR scheme child carries an SA number (453 of 453, 376 distinct) and the
Commission publishes a case record per number. All 376 resolved, a 100% hit rate.
`ETL/terms/fetch_state_aid_cases.py`, cached to `data/raw/state_aid_cases/cases.json`.

**It must be a POST.** The identical URL as a GET returns HTTP 500, and
competition-cases.ec.europa.eu is a client-rendered app with a catch-all route,
so the case URL and every guessed API path return the same empty shell. The real
endpoint was found by opening a case in Chrome over CDP and reading what the app
itself calls. Match `reference` exactly: a text search for an SA number also
returns cases that merely cite it.

What it unlocked, in order of value:

| | |
|---|---|
| Instruments renamed from the register | 430 |
| Sharing a display name | 505 -> 209 |
| Article ceilings grounded in registration | 234 of 270 |
| Funds no longer proposable (scheme closed) | 220, EUR 49.7B |
| Regional eligibility filters | 10 -> 104 |

### Three findings worth keeping

**The register knows the research category.** `gber_aid_intensity.json` asserted
that the Art. 25 category is "a property of the PROJECT, not the scheme", so the
ceiling had to be published as a band. That was wrong: a notified scheme is
registered under specific sub-paragraphs, and 252a-252d ARE the categories.
Compared against the inference on 274 children, they agree on 44, the register is
MORE SPECIFIC on 161 (Art. 25 -> Art. 25(2)(b)), and 23 were genuine corrections.

**Award recency cannot tell you if a fund is open.** Payments run for years after
a scheme closes to new applicants: 220 of 453 sit under a closed scheme and 130
still looked current on a 2024 or 2025 award. "Italy - Support to electricity
from renewable sources" ended 2021-12-30. They stay in the corpus for history and
are removed from proposal only. 40 have a successor still running, recorded on
the instrument.

**Region gates are the one filter class with no empirical audit.** They can
disqualify, and a region failure is structural, so a mismatch removes the fund
silently. `audit_encoding_vs_reality.py` cannot check them: `companies` carries
city and postal_code but no NUTS region. Deriving recipient regions from postal
codes is the open fix.

### What did not land, and why

**EIS naming.** The Estonian feed carries the programme name in the rendered
row's 6th cell, and the extractor discards it. Altum's equivalent fix worked
(22 collisions -> 0, 3,921 events backfilled). EIS did not: loading the file
offline dispatches to `_parse_record`, not `_extract_ee`, and that path derives
an instrument's identity from a truncation of the `programme` field. Loading it
merged distinct measures into shared instruments, taking unnamed EIS funds from
22 to 86; widening the truncation made it 118, because the identity is the wrong
FIELD rather than the wrong width. 4,506 events were reverted rather than ship a
regression. The capture is in place for whenever `source_to_family` is fixed.

Cell 5 is the programme; cell 6 is the funding source ("Riigieelarve (RE)"). An
agent proposed cell 6. Taking it would have named every Estonian fund "state
budget".

### The region guard, and the three defects it found

CLOSED, and not the way it was specified. Postcode coverage on the region-gated
events is 1.5%, so a postcode guard would have checked 1% of the evidence. It was
unnecessary: `satr_staging.region` carries the beneficiary's NUTS region on all
122,814 rows, published under the same transparency obligation as the amount, so
`ETL/terms/audit_region_claims.py` resolves 100% of events against Eurostat's own
name register rather than a heuristic. It runs in the pipeline and REPORTS ONLY:
region evidence describes the project's location while the gate asks where the
company sits, so deleting a contradicted filter would put a Paris company back in
front of a Normandy scheme.

Building it found three defects in the filters shipped hours earlier:

| | before | after |
|---|---|---|
| gates checked against recipients | 93 | 134 |
| corroborated (>=80% inside) | 88/93 (95%) | 131/134 (98%) |
| awards inside registered regions | 92.6% | 98.8% |
| gates written in a retired vintage | 13 | 0 |

1. **Two syntaxes, one read.** `NutsRegionPT117` is a region, `NutsRegionDE` a
   country; the regex matched only `RegionNuts2021.X`. SA.41942 lists 31 tags, 28
   bare, and 3 survived: four Portuguese programmes excluded 85-100% of their own
   recipients and Centro 2030 admitted none of its 153 awards. The discriminator
   is what follows the country code, not which prefix was used.
2. **Retired vintages nobody can satisfy.** Zuid-Holland's own scheme demanded
   NL33 when Zuid-Holland is NL36 in 2024. Retired codes now generalise to their
   nearest current ancestor and are dropped where none exists. Generalising can
   only widen a gate; translating would be a guess, since PT17 became both PT1A
   and PT1B.
3. **Stale gates were never deleted.** `eligibility_gates` survives the
   instrument reload, so a UK scheme kept demanding UKC..UKK after the vintage
   check began rejecting them. A rule that stops holding is now removed.

One scheme needs a human: `satr_de_rnd__sa_110716__bezirksregierung_arnsberg`,
registered for DEA but paying into Hamburg, Rheinland-Pfalz and Hessen at 59%
inside. Not a parsing artefact; someone must read the decision text.

### Open, in rough order of value

1. **Regime rules attribution.** 453 children still inherit criteria extracted
   from ONE document per regime, currently labelled "State aid regime:" as a
   holding fix. The register gives each scheme its own objectives, regions and
   aid instruments, which is the material for real per-scheme criteria.
2. **EIS identity.** 22 funds, and the name is already in the feed. Blocked on
   `source_to_family`, not on data: loading the Estonian file offline dispatches
   to `_parse_record`, which derives an instrument's identity from a truncation
   of the `programme` field, merging distinct measures. Widening the truncation
   made it worse (86 then 118 unnamed) because the identity is the wrong FIELD.
3. **Art. 107(3)(a) uplift** deliberately unencoded: two sources conflict
   (25pp vs 15pp). Needs the Official Journal.
4. **One region outlier**, Arnsberg above.
5. Innovasjon Norge, Bpifrance and CDP Venture Capital refuse automated access
   (403 / Radware CAPTCHA) and are deliberately left alone. 14 ambiguous
   families sit behind these blocks.
