# wsCY — what founders actually receive

Four defects were reported from a rendered brief. Three were fixed at the level
they live at, one is corpus-side and is reported rather than patched. The
contract surface behind all of them was largely unenforced and is now a build
gate.

Everything here is FREE unless marked. Total spend: **~$4**, one bench company.

## 1. The empty memo

`Neura Robotics` published ZERO ROWS. The console said "every institution read
as watch-only"; that branch cannot be reached any more and the real count was
`candidates=0`.

**Cause: the pool was cut before the conclusively-blocked rows were dropped.**
A 250+ FTE company against an SME-heavy national register had 22 accessible
funds and **the first sat at rank 81** — sixty-three places below the 18-row
pool cut. All eighteen seats went to schemes failing the same `fteBand` filter,
`orderMemoCandidates` dropped all eighteen, and the writer got nothing.

Not one archetype. `sennder` (2/18) and `BioNTech` (2/18) are the same shape,
and it explains every thin brief in the bench history.

`VERDICT_POOL`'s own comment already stated the principle — "dropping must be
able to backfill, not shrink the table" — and approximated it with a number. The
distance to the first accessible row is a fact about the founder, not a
constant. `accessiblePool()` makes it exact: **could this row be published if it
were ranked first? If not, it may not hold a pool seat.**

**Outcome for this founder: ROWS, not an honest nothing.** All twelve
archetypes now reach the writer with a full seven candidates. See
`reach_before.txt` / `reach_after.txt`, `neura_robotics_brief_after.json`.

**And where a founder genuinely has none:** `explainNoDoors` names, verbatim
from each fund's own encoded gate, how many funds were ranked and which
requirements ruled every one out. `InstitutionsTable` returned `null` before —
a brief with no section 02 at all.

## 2. The wrong next step

736 published routes, **only 216 recorded about that fund**. 520 are a parent
regime's, drawn from 38 distinct parents. They are addressees, not processes: a
project agency, a ministry's e-headquarters, a development bank, a statute. And
the parent is never the more specific record — 375 children name a different
administering body, 190 a delivery region the parent has none of, 282 scheme
operators the parent has none of, and **parent-only differences are zero on
every field**.

The property (`applicationRoute.ts`): a route is a fact about the fund it was
recorded for; a parent's route may be repeated for a child only where the child
gives us no reason to doubt it, and never in the child's own name. The test:
**does the inherited text address a body this fund is actually administered
by?**

| provenance | rows | what the row says |
|---|---|---|
| own | 216 | this scheme's instruction |
| programme | 209 | published, attributed: "the route recorded for X" |
| **withheld** | **311** | the route is not recorded; confirm it first |
| none | 101 | as before |

311 lands within 7 of an independently-built token-overlap audit's 318.

`timeline` was inherited at **520/520** and travels with the addressee: a
deadline taken from another fund is worse than a wrong address, because it is
what a founder plans around.

**Pure addition:** the fund's own `application_url` now wins over the route's.
88 publishable rows carry one, every one of them has no curated route, so that
column had never reached a founder.

## 3. The film scheme — CAUSE, reported not patched

`Bayerische Richtlinien für die Förderung von Film-, Fernseh- und anderen
audiovisuellen Projekten`, offered to Aleph Alpha at row 4.

**It is not the embedding.** Semantic score 0.225, **rank 843 of 1088** — the
thematic layer correctly says it is a bad match.

**It is the taxonomy.** `sectorMix = {software_data_ai: 20, other: 9}` →
`sectorWeight` = (20/29) × log1p(20) = **2.10**, a fund reading as 69%
concentrated on software/data/AI over 20 awards. Audiovisual production
companies are being NACE-classified into `software_data_ai`, so the sector
prior — which is by design "what a fund has ACTUALLY funded" — is fed a
classification that is wrong. `gates = 0`, so nothing can exclude it either.

All four film/TV instruments in the corpus show it. Two Bavarian ones, an Irish
one (`{other: 102, software_data_ai: 53}`) and a Walloon one
(`{software_data_ai: 130, other: 38}`).

**WHAT I WOULD WRITE TO POSTGRES** (not written; Railway is the source of
truth): reclassify the recipients of instruments whose registered purpose is
audiovisual production out of `software_data_ai`. The general property is that
`sectorMix` is a fact about how RECIPIENTS were classified, not about what an
instrument funds, and where a fund's own registered title contradicts its mix,
the fund's own words win. Fixing it in the ranker would be a patch on a
classification error; the classification is the defect.

## 4. The other archetypes

All twelve rendered and read: `archetypes_after.txt`. The four SMART Photonics
rows that all said "Application submitted to the Minister", two of them
provincial, now say the route is not recorded. Neura's seven are all EU
programmes carrying their own portal route.

## 5. The contract surface

- **All fifteen Banned rules had never been checked**: the enforcement regex
  `([A-Z]+-\d+)\s+\(hard\)` fails twice over on `FUND-B1` (letter where a digit
  is demanded, and no marker at all). Three other regexes in the same file were
  already correct.
- **The quality judge does not exist.** `contracts.ts` claimed one, and that
  claim was the stated ground for exempting 46 judged/soft rules.
- **`contracts/selection/` was never loaded** — six rules, two hard, invisible
  to every check including the row-cap tie, which it contradicts.
- **`POS-6` was declared twice.**
- **`checkBrief` gates nothing.** It runs in two paid benches and one unit-test
  fixture. No brief this pipeline has produced was ever checked against a rule.

Now: every rule is enforced by a named check or declared in
`unenforcedRules.ts` with the predicate that would decide it. No third state.

  `check_contracts: ok — 9 contracts, 89 rules, 27 enforced, 62 declared
  unenforced (buildable 5, judgement 56, no-artifact 1)`

Closed here, each proved red first: FUND-1 (both halves), BRIEF-3 (walk, not a
nine-field union), VOI-B1, FUND-B1, BL-B1, SELECT-1, SELECT-2.

`scripts/check_memo_table.ts` is in `npm run check` and goes red under
`POOL=legacy` on the exact defect — `fund1_red_then_green.txt`.

## Numbers

One replay, tune n=250, `ranker: all 490 request(s) on EMBEDDING`
(`memo_tune_ab.txt`):

|  | before | after |
|---|---|---|
| SCREEN@5 | 26.8 | 26.8 |
| SCREEN@6 | 30.0 | 30.0 |
| MEMO@5 | 24.4 | 24.4 |
| MEMO@6 | **27.2** | **27.2** |
| memo order depth (min / p25 / median) | 11 / 16 / 17 | **18 / 18 / 18** |

Identical at every k from 1 to 7. Nothing was cut. What moved is the thing the
metric cannot see: every founder's pool is now full. The recall set never showed
the pathological case because its founders all WON something, so their pools are
healthy by construction — which is exactly why a number could not have found
this and rendering a brief did.

`npm run check`: recall floor GREEN, `check_winner_not_gated` and
`check_winner_not_blocked` green.

## ██ A FLAKY GUARD, WHICH IS A GUARD THAT WILL BE IGNORED ██

`check_hydration_parity` is NON-DETERMINISTIC. On this branch, with no code
change between runs, it went **fail, fail, ok, ok** — and the two failures named
a DIFFERENT archetype each time (bunq/NL, then GovTech/IT), each one sibling row
of one body differing between the Postgres and snapshot paths. Main passed
twice, which is what made it look like a regression here for an hour.

It is not this branch. It is a check whose comparison can tie: the snapshot
corpus is 89 rows short by the degradation policy, the check re-ranks live
without them, and two siblings that score equally can settle either way. A guard
that fails one run in two teaches people to re-run it, which is the same as not
having it.

RECOMMENDED, not done here (it is a different workstream and this one had
already spent its budget): make the tie-break total, so equal-scoring siblings
have a defined order, and the check either agrees every time or has found
something.

Two other suite failures ARE pre-existing, confirmed by running them on main:
`check_corpus_census`, and `check_verdicts` — the latter expected, since it
fails when the ranking code differs from the code the last published floors were
measured on, which is exactly what this branch is.
