# Workstream AV — the funds no founder could ever be shown

**2026-08-08.** Nine publishable instruments carried `capital_type = "unknown"`,
which no intake option maps to, so the capital filter removed them for every
founder in every country however they answered. They could never appear in a
memo. Workstream AE found them while attributing a different loss and guarded
them with a ratchet, because the honest fix was upstream.

**It was not nine mistakes. It was one, and it was structural.**

---

## 1. The defect

`row_capital_type()` in `ETL/events/load/populate_funding_instruments.py`
enumerated `EQUITY_BASES`, `LOAN_BASES`, `GUARANTEE_BASES` and `DEBT_BASES`.

There was no `GRANT_BASES`. "Grant" could only be concluded from a **populated
euro amount**.

So a register that publishes *who* it funded but not *how much* produced rows
with no capital type at all. That is Rule Zero's error compiled into a cascade:
**a missing amount was being read as a missing fact about the instrument.**

Measured across the events table:

| | rows |
|---|---|
| events landing on `unknown` purely for want of an amount | **15,137** |
| of those, from a basis whose own label says `grant` | 14,660 |
| `horizon_eu_grant` | 8,078 |
| `fr_innov_grant` | 2,887 |
| `ihi_grant` | 727 |
| `eit_kic_support` (the EIT fall-through) | 477 |

Most families outvoted their amount-less rows in `family_capital_type`, so the
damage surfaced only where **100% of a family's rows lacked amounts**. That is
the nine. The other 15,000 rows were one changed source away from doing the same
thing, and nothing would have gone red.

The second half of the defect was in `extract_eit.py`: a four-branch `if/elif`
over source-id prefixes with `else: basis = "eit_kic_support"` — a label naming
no kind of capital. 477 of 583 EIT events took that branch.

**Both are the same shape: a fall-through that produces a value nobody can
reach, silently.**

---

## 2. What each of the nine actually is (Rule Zero)

Established from official sources, per instrument. Second-party and
not-determinable results are marked as such rather than rounded up.

| instrument | verdict | evidence |
|---|---|---|
| `eit_climate_kic_asa` | **grant** | EIT's own page for the Amazon Sustainability Accelerator: "a EUR 12 000 cash grant"; programme "equity-free" |
| `eit_climate_kic_cdr` | **grant** | "supported the startups financially with non-dilutive grants" — ETH Zurich sus.lab, a programme co-lead. **Second-party**: climate-kic.org's own cohort pages name no instrument |
| `eit_climate_kic_clean_cities_spain` | **undetermined** | ClimAccelerator is two-stage — Stage 1 cash to €25k, Stage 2 a Climate-SAFE, "a simple agreement for future equity". The 2024 cohort page names neither stage nor instrument |
| `eit_digital_champions` | **non_financial** | Cash prizes once, in 2021 (€250k). 2022-25 winners "join the EIT Digital Accelerator program" / "Growth Services programme". No money |
| `eit_digital_vap` | **non_financial** | "free access to the 12-month EIT Digital Accelerator Programme worth €50,000" |
| `eit_food_rfs` | **non_financial** | RisingFoodStars is an association: mentorship, workshops, corporate access. Members historically **paid** to join |
| `eit_health_catapult` | **non_financial** | Money at the final only — two winners take €30k each. Our rows are the 42, 30 and 29 **semi-finalist** announcements, who "receive high-quality training" |
| `eit_rawmaterials_portfolio` | **equity** | Portfolio PDF: "forms part of our active equity portfolio"; Booster guidelines: "EIT RawMaterials shall be entitled to acquire interest in the equity of the venture" |
| `fr_relance_industrie` | **grant** | DGE measure sheet: "**Subvention** : jusqu'à 60%…" and "Le financement apporté par l'Etat est **sous forme de subvention**". Cour des comptes records that repayable advances and equity were considered for these measures and "cette option n'a donc pas été retenue" |

Also corrected, though not publishable: `eit_urban_mobility` (grant — €2,500-15,000
equity-free alongside services), four Enterprise Ireland instruments (grant), two
SPRIND instruments (grant).

**The general lesson, which is why this had to be per cohort and not per
programme:** "EIT gives grants" is false and "EIT takes equity" is false. The
KICs run both, and which applies is a property of the **cohort year and stage**.
EIT Digital paid cash exactly once. EIT Urban Mobility's grant shrank
15k → 5k → 2.5k while its "€30,000 worth of support services" headline stayed
fixed. Three traps sit in the page text for anything reading by keyword: Health
Catapult calls its prize pot an "investment prize fund"; RisingFoodStars cites
"$15 million in investment from the EIT Food Impact Fund" (a cumulative alumni
figure from a separate vehicle); 28DIGITAL publishes an equity portfolio that
belongs to different programmes entirely.

**Correction carried from the research:** EIT Urban Mobility signed no SAFEs in
2022-2024. The Techstars SAFE dates from July 2026. Any SAFE flag on a pre-2026
EIT Urban Mobility row would be wrong.

---

## 3. `unknown` was three states, and only one of them was a defect

This is the finding I would keep if I could keep only one.

    non_financial   the source says it pays nothing.   A DECISION.
    undetermined    the source was asked, and will not say.  A DECISION.
    unknown         we never recorded it.             A DEFECT.

All three were `unknown`, all three were unreachable, and the product treated
all three identically — so there was no way to tell a debt we owe from a
judgement we made. That matters practically: a ratchet over the merged state can
never reach zero, because the honest unknowables sit inside it and put a floor
under the number that no amount of upstream work can remove.

Separating them is also what makes withholding honest. A `non_financial` row
being dropped by `instrumentServesCapital` looks exactly like a tax credit being
dropped for a founder who asked for grants: a preference being honoured. It is
not. It is our editorial judgement wearing the founder's answer. Those rows are
now withheld at the corpus boundary, by a declaration that states the reason,
because a decision we made should be recorded where we made it.

**And a programme that pays nothing is not a funding instrument.** EIT Digital's
VAP and EIT Food's RisingFoodStars are real and worth entering, and they are not
a raise. Every option the intake offers is a kind of capital, so there is no
answer that means "coaching". They are declared unofferable rather than given an
invented capital type — the brief's point 3, and the right outcome.

---

## 4. The fix, upstream

**`CAPITAL_BY_BASIS`** — the mapping from `grant_amount_basis` to capital kind
is now declared once and is **total**. `assert_bases_declared()` fails the load
on a basis nobody has classified, so a new source lands a build failure naming
the basis and asking what it hands out — a question with an official answer —
instead of landing funds no founder can see.

`None` is a real declaration, not a hole: it means *this basis names no kind,
decide from `aid_instrument` or the amounts*. State-aid registers are the case.

The declaration **outranks the amounts**, and that inversion is load-bearing:
`cdti_loan` records loans in `grant_amount_eur` and `ndb_guarantee` records
guarantees in `debt_amount_eur`. The euro columns are a payload, not a kind, and
reading the kind off whichever column is populated calls both of them wrong.

**`COHORT_CAPITAL_BASIS`** in `extract_eit.py` — per cohort, cited per entry,
raising on an undeclared cohort. The loader now **reconciles its own rows on
every run**: the insert skips a `(source, call_id)` it has seen, so a corrected
declaration would otherwise never reach the rows it describes. That is not a
row-by-row patch — it is the opposite. The declaration is what persists, and a
manual edit to those rows is what gets overwritten.

**Migration 026** widens the `capital_type` CHECK. SQLite cannot `ALTER` a CHECK
and migration 021 rebuilt the whole table to widen `name_source` — 54 columns
ago. Rebuilding again would mean hand-restating a column list that has grown six
times since, which is the stated reason 021's own comment gives for reading the
schema rather than assuming it. So the DDL text is edited in place: no data
moves, no column list is retyped, nothing can be dropped by omission.

**`family_capital_type`** may no longer emit `blended` from a split between a
capital kind and a non-capital one. `blended` is read downstream as "a mixture
of kinds, so no stated preference can rule it out" and is admitted to every
founder's pool on that reading. A split between "pays a grant" and "pays
nothing" is not that; it is `undetermined`, which is withheld.

---

## 5. The property test, which is the point

`lib/intelligence/offerableAxes.ts` + `scripts/check_capital_reach.ts`.

> **Every value a publishable row can carry on a filtered axis must be either
> reachable by some single intake answer, or declared unofferable with a reason.
> Silence is the only forbidden state.**

Three outcomes, one failure:

- **undeclared** — hard fail, no ratchet. The case it exists for: a source
  introducing `mezzanine` tomorrow fails without anybody having thought of the
  word in advance.
- **withhold** — a decision. Already removed from publishable; seeing one here
  is itself reported as a bug.
- **gap** — a collection failure. Ratcheted toward zero.

Two things were got right by construction, both because earlier versions got
them wrong:

**Reachability is asked of the shipping filter, one answer at a time.** Never of
a recomputed map. `blended` is in no option's mapped values and is admitted by
all of them; a map-based test reported the corpus's largest debt programme as
stranded from every founder on the day the filter began admitting it. And one
answer at a time, not the set: a fund only reachable by a founder who ticks every
box is reachable by no founder who has a preference.

**It now covers every axis, not capital.** `country` is the other hard
corpus-vs-intake join in `selectLeafInstruments` and had never been asked this
question — which is how the first one went unexamined for as long as it did. It
is clean (ceiling 0).

`offerableAxes.test.ts` pins the declaration's shape on any corpus: a declared
value must actually be unreachable (a stale declaration hides a fund and reads as
deliberate), every declaration carries a reason, `withhold` and `gap` do
different things, and a blank is a value so it cannot hide.

**A test caught me making the very error this workstream is about.** My first
version asserted `reachable(o.value)` over `CAPITAL_OPTIONS` — probing a
corpus-side axis with an *intake answer*. `recoverable_advance` is an answer with
no corpus value of its own; it maps to `loan`, because the state-aid register does
not separate them. Two vocabularies joined by a map, and I put one where the
other belonged. That is the same category error as reading an unrecorded fact as
a refused preference.

---

## 6. Measured

**Postgres, read back out of Postgres.**

| capital_type | before | after |
|---|---|---|
| grant | 876 | **886** |
| equity | 24 | **25** |
| unknown | **31** | **15** |
| non_financial | — | 4 |
| undetermined | — | 1 |
| loan / tax_credit / blended / guarantee / framework | 105 / 27 / 9 / 8 / 8 | unchanged |

All 15 remaining `unknown` rows are synthetic rollups with **zero events**, which
`publishableInstruments()` excludes for other reasons entirely.

Publishable instruments stranded by an unreachable capital type: **8 → 0.** The
`check_capital_reach` ratchet drops from 8 to 0 and both axes are at ceiling 0.

Publishable count 769 → 764: three rows became reachable, five are withheld by
declaration.

**Recall, `SPLIT=holdout`, three seeds. Floors pool 93 / EXACT@5 22 / REGIME@5 80.**

| seed | pool | EXACT@5 | REGIME@5 | CHANNEL@5 |
|---|---|---|---|---|
| 20260806 | 94% ±2.9 | 26% ±5.4 | 82% ±4.7 | 88% |
| 7 | 95% ±2.8 | 27% ±5.5 | 83% ±4.6 | 87% |
| 99 | 95% ±2.6 | 32% ±5.8 | 86% ±4.3 | 89% |

`check_recall_floor` (own pinned seed, tune split): pool 97%, exact5 30%,
regime5 86% — all floors met.

By regime-size stratum, seed 20260806 / 7 / 99 (REGIME@5): alone 33/31/33 ·
2-5 50/67/33 · 6-20 47/56/61 · 21-50 86/83/91 · 51+ 98/99/100. By country
(REGIME@5): FR 76/75/87 · DE 94/94/98 · SE 98/95/98 · IT 93/92/91 · NL 89/94/86 ·
ES 63/60/40 · GB 33/33/33. The small-n strata swing by 20-30 points across seeds,
which is sampling, not signal.

### The honest reading of that table

**None of it moved because of this change, and I can show that rather than assert
it: zero of the 4,796 recall pairs name any of the 16 corrected instruments or
their descendants.** The measured effect on recall is nil by construction. The
figures are here to demonstrate nothing broke, not to claim a gain.

What actually changed is small and countable: **four funds became visible to
founders for the first time**, one of them carrying 2,835 awards; **five were
removed honestly** instead of vanishing silently; and **a whole class of silent
invisibility now fails a build.** That last one is the value. The nine were found
by accident, and a second value on the same axis was misdiagnosed in the opposite
direction. There was no reason to expect a third to be found by luck either.

---

## 7. What a founder sees, rendered and checked

Because this is the first time any of these rows could be shown:

| row | name shown | support type | equity-tickers only? | shown by default? |
|---|---|---|---|---|
| `eit_climate_kic_asa` | EIT Climate-KIC Amazon Sustainability Accelerator | Grant | no | yes |
| `eit_climate_kic_cdr` | EIT Climate-KIC Carbon Removal ClimAccelerator | Grant | no | yes |
| `eit_rawmaterials_portfolio` | EIT RawMaterials equity portfolio | **Equity stake** | **yes** | **no** |
| `fr_relance_industrie` | France Relance — soutien à l'investissement industriel | Grant | no | yes |

**The founder-facing lie the naive fix would have shipped.** `unknown` has no
entry in `CAPITAL_TYPE_LABEL`, so it falls through to `CHANNEL_SUPPORT_TYPE` —
which asserts something confident and channel-shaped. Had these been admitted
while still typed `unknown`, `fr_relance_industrie` would have rendered as
**"Loan / guarantee"** (the development-bank default) when it is a subvention, and
`eit_rawmaterials_portfolio` as **"Grant + venture support"** (the EIT default)
when it takes a stake. Both are the opposite of the truth, stated with no hedge,
to a founder who could act on it. Same shape as workstream AR's `supportTypeLabel`
catch. `CAPITAL_TYPE_LABEL` now answers for every value the column can hold, not
only the ones expected to be seen.

**And the protection held where it mattered:** EIT RawMaterials is `equity`, so
`passesCapitalPreference` shows it only to a founder who explicitly asked for
equity — not to grant-seekers, and not to a founder who left the field blank.
Admitting `unknown` to everybody, which was the tempting shortcut, would have put
a cap-table investor in front of both.

**Names.** These four were unreachable, so nobody had ever read their names and
the deterministic prettifier's output went unexamined: "EIT Climate KIC Asa",
"EIT Climate KIC Cdr", "Fr Relance Industrie". Fixing what a fund IS put those
strings in front of founders, which makes them this workstream's problem, not a
pre-existing one. Named from each programme's own page via `OVERRIDE_NAMES`, and
`ETL/terms/apply_override_names.py` materialises that declaration without a full
instrument rebuild.

---

## 8. Two things handed on, not fixed here

**a. France Relance is a CLOSED programme, and nothing in the corpus records
that.** Deployment ran 2020-2022; the AAPs behind these 2,835 awards closed at
the final relève of 7 September 2021; the open dataset is frozen at 2022-04-08;
the successor for founders is France 2030. It carries no `scheme_end_date`, no
`application_url` and a NULL `route_status`, so it is publishable by default.

I did not record the closure, and the reason is not squeamishness:

- `scheme_end_date` is in `BUILT_COLUMNS`, so `populate_funding_instruments.py`
  wipes it on the next rebuild. A value written there would look applied and
  silently revert — the exact trap this brief warns about.
- `route_status = 'none'` **is** durable (preserved by difference), and it is the
  wrong column. It means "this was never an offer" — a register artefact. France
  Relance *was* a real offer with a real route that has since ended. Using it
  would be precisely the conflation `offerRoute.ts` was written to stop.
- The durable home for "this source's window has closed" is
  `source_window_policy`, which **workstream AJ is building** and which already
  exists in Postgres (834 rows `publishes_no_window`, 249 `publishes_window`)
  with nothing on `main` reading it. Building a second mechanism beside it would
  be the worse outcome.

**Measured before deciding:** France Relance does not reach a French founder's
pool today. It is outranked out of all 18 slots — France is the deepest-covered
country and a 2022-vintage rollup with no sector mix and no amounts loses. So the
exposure is latent, not live. **It should still be closed by whoever owns the
window axis, and the evidence is above.**

**b. The committed snapshot's gate layer is stale against both databases.** 43
`valueSpec` differences across ~30 instruments — country canonicalisation
("Czech Republic" → "Czechia", "IE" → "Ireland"), region widening (FR1 →
FR1+FR10), and 16 gates quarantined on 2026-08-07 whose `value_spec` was nulled.
SQLite and Postgres agree with each other; only the snapshot is behind.

This is in-flight gate-encoding work, not mine, and regenerating the snapshot
wholesale would commit other workstreams' uncommitted SQLite state — the
documented failure mode `publish_scheme_text_scoped.py` exists to avoid. I synced
only the two columns this workstream owns (`capitalType`, `name`), by id, from
Postgres.

**Consequence, stated plainly:** `check_hydration_parity` was already failing on
`main` (5 archetypes on "eligibility screen differs", plus 1 gate-order
difference). On this branch it reports 11. The extra six are not a new defect —
two rows I made visible carry one of the 43 already-diverged gates, so they joined
an existing population. **No new failure category appears:** pool membership,
published rows and row sets are identical between the two corpora. The fix is the
gate publish.

---

## 9. Build state

Green, except three reds that reproduce on an unmodified `main` checkout and were
verified there:

| check | state | whose |
|---|---|---|
| `check_capital_reach` | **ok**, 0 stranded on both axes (was 8) | this |
| `check_offer_route`, `check_corpus_currency`, `check_degradation`, `check_recall_floor`, `check_leaf_cap`, `check_vocabularies`, `check_liveness`, `check_archetypes`, `check_contracts`, `check_recall_leaks`, `check_client_boundary` | ok | — |
| `tsc`, `vitest` (260 tests, 6 new) | ok | — |
| `check_corpus_census` | red on `main` too — census #6 did not finish cleanly | wsAK / pipeline |
| `check_dependencies` | red on `main` too — HIGH `nanoid` | — |
| `check_gate_pertinence` | red on `main` too — 265 unclassified | gate encoding |
| `check_hydration_parity` | red on `main` too (5 → 11, §8b) | gate encoding |

`themeIndex.generated.ts` and `semanticCache.generated.json` were regenerated:
the instrument names changed, so both committed mirrors had to answer for the
corpus that now ships.

---

## 10. Files

**ETL**
- `events/load/populate_funding_instruments.py` — `CAPITAL_BY_BASIS` (total),
  `assert_bases_declared()`, `row_capital_type()` inverted, `family_capital_type()`
  non-capital rule, four `OVERRIDE_NAMES`
- `events/extract/extract_eit.py` — `COHORT_CAPITAL_BASIS`, fall-through removed,
  per-run basis reconciliation
- `events/load/migrations/apply.py` — migration 026, `CAPITAL_TYPE_VALUES`
- `events/load/recompute_capital_types.py` — same gate as the full rebuild
- `events/load/qa/sanity_check.py` — replaced a 14-of-58 stale basis list with the
  question that can now fail a load
- `terms/publish_capital_type.py`, `terms/apply_override_names.py` — scoped
  publishers; never insert, never delete, reconcile the PG CHECK
- `schema` — `011` and `website/build/postgres_schema.sql` CHECK widened

**Product**
- `lib/intelligence/offerableAxes.ts` (new) — the registry and the declarations
- `lib/intelligence/offerableAxes.test.ts` (new) — 6 shape tests
- `lib/intelligence/corpus.ts` — withhold by policy at the corpus boundary
- `lib/intelligence/pipeline.ts` — `CAPITAL_TYPE_LABEL` total
- `scripts/check_capital_reach.ts` — generalised to the axis registry, ceiling 8 → 0
