# Workstream board

One line per workstream, with what "done" means and where it actually is. Update
this when a workstream moves — it is the thing to read when the picture has gone
opaque.

**Status now: seven workstreams stalled mid-task on the Anthropic monthly spend
limit.** Each pushed its work first, so nothing is lost; each is resumable from
its branch. Raise the limit at `claude.ai/settings/usage` and they can continue.

---

## CLOSED

| # | Workstream | Done means | Evidence |
|---|---|---|---|
| ETL | Weekly pipeline runs unattended | trigger → run → census → verified restore | census #4; cron `0 3 * * 0` SUCCESS |
| — | One blocked source can't kill the week | `renew.py` 3=partial / 1=abort | ADEME 403 no longer stops the chain |
| ES | Spain offerable and legible | names are funds, weekly re-run, decay guard | 182 ES rows; refresh exits 0, both stores reconciled |
| DEG | Degradation policy shipped | no dead call shown, no recall cost | FR EXACT@5 17% vs blunt 8%; suppression 80→5 |
| COV | Coverage push | sibling class down, ceiling up | 17.9 → 3.6; ~~@5 ceiling 39% → 85%~~ ⚠ **the ceiling half is RETRACTED — circular key (verbatim `eligibility_text`); see `findings/rich_intake_wsCC.md`, ceiling of record 65.9%.** The sibling-class movement stands |
| CAP | Leaf cap no longer silently binding | cap raised, baseline captured first | 90 → 250, headroom 147 |
| KEY | Answer key and artifacts trustworthy | leak index + semantic cache rebuilt | 0 leaks over 1,084 profiles |
| AI | Nothing a founder is judged by is a report about someone else | both columns judged at one property, build fails on an unjudged or stale one | 2,573 texts / 8,488 deciding gates at v3, 13/13 calibration; gates 4,251 → 4,244; prose 563 → 552; recall flat on 3 seeds |

## IN FLIGHT — all stalled on the spend limit

| # | Workstream | Approx | What it has | What remains |
|---|---|---|---|---|
| **AK** | Website numbers live from the DB | 80% | headline figures read the ETL corpus at render time | wire the coverage gate so a bad corpus can't reach founders; look at it in a browser, including DB-unreachable |
| **AF** | Guards without CI credentials | 60% | verdict-publishing pattern generalised | the scheduled workflow, dropping the DB secret entirely |
| **AE** | 22 German leaves cut pre-cap | done | **21 were tax credits a grant-seeker did not ask for — the filter is right. The 1 was a display rule deleting from the pool; fixed and guarded** | nothing. The capital half is handed to **AR** |
| **AH** | 36 scripts can measure nothing and exit 0 | 50% | build now fails on a re-pasted env preamble | actually run every converted script — a silent pass converted to a silent pass is worth nothing |
| **AG** | Explain +€55.6B and −558 companies | 30% | **found a second schema drift: four columns exist only from hand `ALTER`s** | measure which; then decompose the capital jump |
| **AJ** | Record whether a source publishes windows | 5% | — | the ADEME window fetch and the assignment pass |

## HANDOFF — AE to AR, on the capital filter

AE and AR were both pointed at `passesCapitalPreference` / `instrumentServes
Capital`. They are asking DIFFERENT questions of it and the answers do not
collide, so AE took the dedupe half and states its capital findings here as
input rather than acting on them.

- **AE's question** — under the harness's FIXED `capitalSought=[grant,loan]`,
  what removes 22 German SATR leaves? **Answer: 21 are `capital_type=
  tax_credit`** (the Forschungszulage across 18 tax offices, SA.114724, and one
  CHP surcharge reduction). A founder who ticked Grants and Loans and not Tax
  credits asked not to be shown these. **The filter is correct. No change.**
- **AR's question** — under DERIVED per-founder answers, is the filter too
  strict for the pool points lost between 94% and 91%? Untouched by AE.
- **What AE hands over, measured, for AR to not re-derive:**
  1. The harness's fixed constant imposes a **ceiling on `pool` of ~99%** —
     1.0% of holdout pairs won a `tax_credit` and 0.1% an `equity`, and those
     pairs are unreachable by the founder's own stated preference before
     ranking is consulted. `scripts/census_capital_reach.ts` prices it. That
     point is NOT the ranker's, and AE deliberately did not widen the constant:
     it is uniform across every pair, which is what makes it leak-free, and
     moving it moves the population `check_recall_floor.ts` was calibrated on.
  2. **8 publishable instruments carry `capital_type="unknown"`, which NO intake
     option maps to**, so they are cut for every founder in every country
     whatever they tick. This is a distinct defect from "too strict" — it is
     our missing fact read as the founder's refusal. Guarded as a ratchet by
     `scripts/check_capital_reach.ts`; the honest fix is upstream in the ETL and
     is not AR's either unless AR wants it.

## FOLLOW-UPS left open on purpose (AI)

- **Channel-level removal does not report per instrument.** AE's attribution
  found 12-13 publishable instruments per market absent from the pool with NO
  `ExclusionLog` event against their id — every one an EU-wide leaf
  (`innovation_fund`, `chips_ju`, `edf`, `eib`) in a channel the founder's
  request never selected. The pool is not wrong; the LOG is silent about a whole
  stage, so any future attribution that lands on those rows will read as the
  unattributed-removal defect class and cost someone the same afternoon it cost
  AE. Worth a channel-stage rule id. Not done here: it is a reporting change to
  a stage this workstream did not otherwise touch.

- **Two of the eleven retracted rows deserve REPLACEMENT, not just retraction.**
  `satr_de_equity__sa_115337__landwirtschaftliche_rentenbank` named its
  applicant classes in a parenthetical — "(Landwirtinnen und Landwirte,
  Lohnunternehmerinnen und Lohnunternehmer, Maschinenring, Naturschutzverband)"
  — inside a sentence whose main clause is procedural, and
  `innovasjon_norge_grant_regional` buried "må bedriften ivareta prinsipper for
  ansvarlig næringsliv" in a page of state-aid administration. The classifier
  called both reports and it is defensible on the sentence AS A WHOLE, which is
  the property. But `narrow_but_satisfiable` in the calibration set says a
  restriction to a named TRADE is a condition, so these two sit close to that
  line. Retraction is the safe half of the fix; the source pages are cited on
  both rows and the honest end state is prose taken from them. Do not settle it
  by hand-editing a verdict.
- **The two Altum rows had the granting body's name in the eligibility column
  and `administering_body` NULL.** The retraction cleared the wrong-column
  value; it did not populate the right one, because what a fund IS comes from
  the official source and not from our own mis-filed column.

## RESOLVED BRANCHES — workstream BG, 2026-08-08

Four branches carried measured work that had never landed. An unmerged branch is
an orphan: real measurement that no longer runs, cannot regress, and gets
silently re-derived next month. All four are now closed, and nothing was
deleted before it was pushed.

| branch | resolution | where the finding lives now |
|---|---|---|
| `workstream-l-thin` | **merged whole** | `findings/workstream_l_thin.md` — EE/CZ/LV are the best-separated countries in the corpus (class 1.2 / 1.6 / 5.6); FR+ES+SE hold 87% of the sibling mass; an unclaimed 0.76 that needs no fetches |
| `wsJ-representative-chooser` | **merged, minus its ranker change** | `regimeCases.ts` (one within-regime population), the empty-gate-array defect fix, `measure_offer_separability.ts`; its 27%/39% ceiling is marked CORRECTED in `research/target_arithmetic.md` |
| `wsG-region` + `wsG-scorer-width` | **archived, finding kept** | `findings/region_as_ranking_signal_wsG.md`, the `regionScorer` comment, and a `WIDTH=` flag on `measure_region_routing.ts`. Tag `archive/wsG-region` |
| `wsM-sibling-collapse` | **archived, finding kept** | `findings/sibling_collapse_wsM.md` and a DO-NOT-COLLAPSE block at the line in `materialiseInstrumentTable` both attempts edited. Tag `archive/wsM-sibling-collapse` |

**The pattern the four share, and the reason this was worth a workstream:**
three independent attempts to widen a per-scheme signal past its scheme all lost
points, and two independent attempts to collapse a regime onto one row both lost
points. Each was retried because the previous refusal lived on a branch. They
are now recorded at the line a fourth attempt would edit, with the one command
that re-checks the premise.

## HOLDING, deliberately

- **Do not deploy €408.4B to the site.** The site ships €352.9B / 297,933 events.
  The database holds €408.4B / 299,384. The +€55.6B is €38M per new event —
  plausible for state aid, implausible for most sources — and **undecomposed**,
  because the census block that would have shown the breakdown failed on the
  schema drift AG is now chasing. Companies also fell 558 with no verified
  cause. Publishing a headline we cannot explain is what the coverage gate
  exists to prevent.

## NEEDS YOU

1. **Raise the spend limit** — seven workstreams are stopped on it.
2. **iCloud → Optimize Mac Storage**, or 1.4G of staged backups never evicts.
3. A JWT for `aides-territoires.beta.gouv.fr` if France's last 26 leaves matter.
4. **The GitHub DB secret is probably unnecessary** — AF is removing the need.

## The pattern worth remembering

Nearly every defect this week was the same shape: **work that reported success
having done something else.** A loader writing to a store nothing reads. A guard
reading a stale artifact. A check exiting 0 because it could not find
credentials. A trigger script that did it three separate ways. The recall number
is not the durable output of this work — the guards that make that class of
failure loud are, and several of those were themselves silent until this week.
