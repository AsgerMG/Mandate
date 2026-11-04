# wsHA — the fact that separates two doors of one regime exists on every single pair, and it is not an eligibility fact

**FOR THE OWNER, VERBATIM.** On the 287 founders who pass their gates, miss the
fund they won, and are shown a SIBLING of it instead, we asked whether anything
in the world tells the two doors apart. **It does, on 287 of 287.** Every pair
differs in its name, its description or its eligibility text — 95.8% in the
description, 79.1% in the eligibility text, and only **four pairs (1.4%)** have
nothing between them but award history. The fact is not missing, it is not on
the funder's page instead of ours, and it is not locked in the founder's head:
for the largest block — Vinnova, 44% of the working set — the separating fact
is the founder's own line of business, and Vinnova's own page calls each of its
seventeen programmes "a distinct initiative" in its own subject area. **What is
missing is the KIND of fact.** Our encoded gates already differ between the two
doors on 94.1% of pairs, and for the founder standing in front of them both
come back *open* on 91.6% — so the rules genuinely separate the doors and
genuinely do not separate this founder, because they answer "may I?" and the
question at the median miss is "which one?". Both doors will take them; only
one is what they wanted. That is why gate work plateaued at +2 points and why
no re-weighting of what we hold moves it: **we are ranking permission and the
founder is choosing purpose.** One caveat that cuts the other way and is worth
more than any number here: the harness pins every founder's `useOfFunds` to the
same two values, deliberately, because the only derivation available reads the
answer off the scheme being predicted — so the one signal that maps onto this
diagnosis is the one signal this population cannot measure.

---

```
run                 2026-08-17, isolated worktree wsHA-doors
population          897 founder(s) — held out, described, one per company, drawn
                    BEFORE the offerability cut
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL to `one_funnel/latest.md`
                    asserted in code, not printed and eyeballed
corpus              postgres  instruments=1088
ranker              all 828 request(s) on EMBEDDING
levers              pool=40 writer_cap=8 published_cap=7 shown=6
cost                one Voyage embedding and one gate hydration per founder.
                    ANTHROPIC_API_KEY deleted before import. NO paid model call.
reproduce           OUT=/tmp/wsha_doors.json npx tsx scripts/_wsha_doors.ts   (~75 min)
                    IN=/tmp/wsha_doors.json npx tsx scripts/_wsha_report.ts   (free, offline)
                    IN=/tmp/wsha_doors.json npx tsx scripts/_wsha_gates.ts    (free, PG only)
                    IN=/tmp/wsha_doors.json OUT=... npx tsx scripts/_wsha_evidence.ts
```

**Read-only on the product.** `rowRelevance`, `orderMemoCandidates`,
`accessiblePool`, `gateFitScorer` and `caps.ts` are untouched. Nothing here is a
proposal. The won fund is read off the recall-set row, a harness object;
`check_answer_not_reachable.ts` is green.

**Reconciliation.** 287 sibling misses of 453, on the funnel's own draw. That is
`rank_shape_wsGY.md` §2's **287 of 454 (63.2%)** to the founder, on the same
draw, the same store and the same levers, re-derived by a different path. Same
channel at six rows: 388 (85.7%) against wsGY's 389 (85.7%).

**The drift warning applies.** `rank_shape_wsGY.md` measured the shipped
ordering moving by about three founders in two hours while workstreams
republish `instrument_profiles`. Everything below is one run against one store;
nothing here is compared against another workstream's run from another hour.

---

## 1. The working set: 287 pairs, and it is two different problems

```
offerable won door                      828
...gates pass                           774
......won door in the six (HIT)         321  41.5%
......miss                              453
.........SIBLING of the won door shown  287  63.4%  <- the working set
.........same CHANNEL shown             388  85.7%
distinct regimes in the working set      15
siblings shown per founder              mean 3.43   1:46  2:42  3+:199
```

| regime | founders | share | cumulative |
|---|--:|--:|--:|
| `vinnova_grant` | 126 | 43.9% | 43.9% |
| `satr_fr_rnd` | 45 | 15.7% | 59.6% |
| `satr_de_rnd` | 32 | 11.1% | 70.7% |
| `satr_it_rnd` | 24 | 8.4% | 79.1% |
| `horizon_eu_pillar_ii` | 15 | 5.2% | 84.3% |
| `ademe_aid` | 11 | 3.8% | 88.2% |
| `horizon_eu_partnership` | 11 | 3.8% | 92.0% |
| everything else (8 regimes) | 23 | 8.0% | 100% |

**Fifteen regimes carry the whole thing and three carry 71%.** That is a small
enough surface to work on a page at a time — but only if the work is the same
work, and it is not. The set splits cleanly in two, and the split is what the
answer turns on:

| | pairs | share | what a "door" IS |
|---|--:|--:|---|
| **named calls and programmes** | 176 | **61.3%** | a thing a company applies to, with a topic, a form and a deadline |
| **state aid (`satr_*`)** | 111 | **38.7%** | a NOTIFIED SCHEME — the legal base the granting body books the aid under |

## 2. Does a separating fact exist — column by column, all 287 pairs

Every column the corpus loads onto an instrument, plus the nested `application`
leaves, tested mechanically rather than reasoned about. `BOTH KNOWN` is the only
column that can carry a real fact: a difference where one side is null is a
difference in OUR COLLECTION, and a ranker acting on it ranks its own coverage —
the documentation-volume prior `leaf_separation_wsAO.md` §4 had to null out
before it could believe gate fit.

Full table in `REPORT.md` §2. The columns that carry a fact:

| column | differ | **BOTH KNOWN** | one known only | both blank | |
|---|--:|--:|--:|--:|---|
| `description` | 99.3% | **95.8%** | 3.5% | 0.7% | |
| `eligibilityText` | 96.5% | **79.1%** | 17.4% | 3.5% | |
| `name` | 98.6% | **98.6%** | 0.0% | 0.0% | structural |
| `lastYear` | 66.2% | **66.2%** | 0.0% | 0.0% | award-derived |
| `schemeCode` | 37.3% | **37.3%** | 0.0% | 61.3% | |
| `administeringBody` | 38.0% | **35.2%** | 2.8% | 2.1% | award-derived |
| `schemeEndDate` | 30.0% | **24.4%** | 5.6% | 57.8% | |
| `application.timeline` | 12.5% | **12.5%** | 0.0% | 0.0% | |
| `capitalType` | 4.5% | **4.5%** | 0.0% | 0.0% | |

**The bottom line, and it is the headline:**

```
  the two doors differ in NAME, DESCRIPTION or ELIGIBILITY TEXT   287 / 287   100.0%
  both differ, neither side null, on BOTH text columns            221 / 287    77.0%
  NOTHING between them but award history and identity               4 / 287     1.4%
```

**The pessimistic answer this workstream was told to be ready to give is not the
answer.** There is no meaningful population of pairs where the fact does not
exist. The four exceptions are named in `REPORT.md` and even they differ by
name (`Inkubatorprogrammet` against `UoH strategisk samverkan`).

### The zeros, which are as much the finding

Sixteen columns are **flat on every pair** with both sides known:
`country`, `isFramework`, `parentId`, `sourceFamilyBucket`, `sourceWindowPolicy`,
`applicationOwn`, `applicationUrl`, `application.url`, `routeStatus`,
`routeStatusSource`, `intensityP50`, `intensityN`, `administeringBodyShare`,
`schemeEndBasis`, `successorScheme`, `successorTitle`.

Three of those matter:

- **`application.url` is blank on both doors for 88.9% of pairs and differs on
  0.0%.** We cannot point a founder at the funder's page for the door they
  should take, and where we can, it is the same generic portal for both
  (`foerderportal.bund.de/easyonline` for every German scheme).
- **`schemeEndBasis` never separates and `callRecurrence` never separates with
  both known** (10.8% differ, all of them one-side-null). "This one is open and
  that one shut" is not available as a separator on this population.
- **`parentId` at 0.0% and `id` at 100.0%** are the control at each end. The
  instrument is working.

`ARCHITECTURE.md`'s dead-routes row says per-fund evidence is "+0.0, and
structurally so", because case-register and SATR fields join on the SA number
and the loader splits a regime on that number. **Tested rather than trusted:
`schemeCode` differs on 37.3% of pairs and is both-blank on 61.3%.** The
structural claim is right about the 61.3% — those doors carry no SA number at
all, so nothing joined on one can reach them — and wrong as a universal. The
route's +0.0 is an empirical ranking result, not an impossibility proof.

## 3. Can a founder state it — judgement, over the pairs, by reading them

`PAIRS.txt` is all 287 pairs in full, both doors, untruncated, sorted. This
section is a reading of it, not a rule applied to it.

### The named-call block (176 pairs, 61.3%): yes, and it is their own business

The doors are different programmes about different subjects. Verbatim from the
dump, the pair AIOPT AB was lost on:

```
WON   vinnova_grant__6g
  description   Kostnader för resa, boende registrering och monterplats på Mobile World Congress.
  eligibility   Svenska små- och medelstora företag verksamma inom AI, Edge AI, mobil
                konnektivitet (5G, 6G), resiliens, cybersäkerhet, fysisk AI, eller robotik.
SHOWN vinnova_grant__inkubatorprogrammet
  description   Ansökan om deltagande i acceleratorprogrammet REACH som fokuserar på
                affärsutveckling, marknadsvalidering, investerarförberedelser, pitchträning,
                mentorskap samt nätverksbyggande i Norden och Silicon Valley.
  eligibility   Forskningsbaserade tillväxtbolag med höga internationella ambitioner
```

One pays a stand at Mobile World Congress for a connectivity SME. The other is a
seat in an accelerator. The single most-shown door across the block is
`Impact Innovation - övergripande Water Wise Societies` — water — put in front
of 13 founders whose own doors were `Impact Innovation - Swedish Metals &
Minerals`, `SIP - BioInnovation`, `Cirkulär och biobaserad ekonomi`,
`Framväxande teknologier` and `Accelerationsprogram för deeptech-företag`.
Vinnova's own page, read 2026-08-17, calls each of its seventeen
Strategic Innovation Programmes **"a distinct initiative"** in its own area —
Drive Sweden is autonomous mobility, Innovair is aerospace, SIO Grafen is
graphene, Swedish Mining Innovation is mining.

**A founder can state which of aerospace, mining and medical technology they are
in.** That is not a question about public funding, which is the thing founders
cannot answer; it is a question about themselves, which is the thing they can
answer better than we can.

**This is not the closed route.** `ARCHITECTURE.md` retires *"a designed question
set"* because "topic separates 98% of look-alikes and founders cannot state it",
and wsDT's re-aimed screen changed picks on 8 of 12 with the category errors
surviving. Both of those asked a founder to classify the LANDSCAPE. The fact
here is a description of the APPLICANT, we already ask for it as free text, and
we already hold the matching sentence on both doors. Nothing new needs asking
for the fact to exist on both sides of the join.

### The state-aid block (111 pairs, 38.7%): the fact exists, and the founder is not the one who chooses

Read off the European Commission's own case register (the same API
`ETL/terms/fetch_state_aid_cases.py` already uses), 2026-08-17,
`wsha_state_aid_doors_2026-08-17.jsonl`:

| SA | pairs | the register's own title |
|---|--:|---|
| `SA.111723` | 27 | Régime cadre exempté … aides à la **RDI** pour la période **2024-2026** |
| `SA.111728` | 19 | Régime cadre exempté … aides en faveur des **PME** pour la période **2024-2026** |
| `SA.40391` | 13 | Régime cadre exempté … **RDI** pour la période **2014-2020** — Plan d'évaluation |
| `SA.56245` | 13 | Evaluierungsplan … **Forschungszulagengesetz** (the German R&D **tax credit**) |
| `SA.40405` | 5 | Régime cadre exempté … **protection de l'environnement** **2014-2020** |
| `SA.119375` | 1 | Statligt stöd till FoU inom **rymdområdet** (Swedish **space** R&D) |
| `SA.112283` | 2 | Statligt stöd till **regionala investeringar** (Swedish regional aid) |

They separate cleanly, on three axes: the **purpose** (R&D against SME
investment against environment against space), the **period** (2014-2020 against
2024-2026), and the **granting body**. All three are facts, all three are on the
official page, and all three are already in our corpus.

**And a founder still cannot state which one they will be booked under.** These
are national umbrella block exemptions covering a whole member state for a whole
programming period. `SA.40391` covers every French RDI aid from 2015 to 2020
across nine GBER articles; the company applies to Bpifrance or a Conseil
régional, and the *granting body* decides which framework the award is declared
under and reports that SA number to the transparency register. Two of these
doors — `SA.40391` and `SA.56245` — are literally *plans d'évaluation* /
*Evaluierungspläne*: evaluation-plan annexes to a scheme, which is the
`not_a_fund` verdict `project-mgmt/evidence/README.md` already defines
("a budget code, a legal text with no application route, a register artefact").

So on 38.7% of the working set the honest answer is: **the fact exists and is
ours to use, but not as a question. It has to be inferred from what the founder
says they will spend the money on, never asked as "which framework".** The good
news is that we already ask that: `useOfFunds` is a `first_page` field, and the
register's GBER objectives are already loaded per leaf.

**A concrete, cheap defect found on the way.** Three of the SA numbers in the
working set — `SA.40391`, `SA.56245`, `SA.49781` — are eleven corpus rows named
after their **granting ministry** (`Ministère de l'économie et des finances`,
`MFW SL`) because `nameSource` fell back to `deterministic`. The register
carries a real title for all three; all three were fetched successfully for this
finding. **28 of 287 pairs (9.8%) have at least one door presented to the
founder as the name of a ministry.** The fetcher exists, the endpoint is free,
and 68 of the 79 SA-carrying doors in the working set already read their title
from it — this is a gap in a working mechanism, not a new one to build.

## 4. Do the ENCODED gates already separate the two doors — yes, and it changes nothing

This is the question with a defect attached to it, and the answer is the most
useful thing in the file.

**Answer-independent — the rules themselves, off the corpus:**

```
pairs                                            287
effective gate set IDENTICAL on both doors         3   1.0%
  ...differs in any way                          284  99.0%
DECIDABLE rule set (role=filter + valueSpec):
  identical on both doors                         17   5.9%
  DIFFERS                                        270  94.1%
  ...of the identical, neither door has ANY        0   0.0%
the door's OWN (non-inherited) gates differ      284  99.0%
```

**Founder-conditional — the same rules, run against the founder standing in
front of them, by `assessInstrument`, the function `accessiblePool` itself
calls:**

```
verdict STATUS identical on both doors           274  95.5%
  ...both "open"                                 263  91.6%
verdict STATUS differs                            13   4.5%
number of filters CHECKED differs                167  58.2%
number of BLOCKERS differs                        11   3.8%
```

**Put those two blocks beside each other and the whole workstream falls out.**
The gates encode a real difference between the doors on 94.1% of pairs. For the
founder, both doors come back **open** on 91.6%. The rules separate the doors
and do not separate this founder — because an eligibility rule answers *may this
company apply*, both answers are yes, and the founder's problem is *which of
these two should I spend six weeks on*.

**So nothing downstream is ignoring the gates.** They are read, on the shipped
path, and they return `open / open`. The brief's actionable-defect branch is
closed: there is no bug here. The gates are the wrong instrument for this
question, not a broken one — which is also why `leaf_separation_wsAO.md`'s
`gateFitScorer`, correctly built and correctly wired, moved the headline about
two points and stopped.

Which intake field a *differing* decidable gate hangs off, for the 94.1%:

| field | pairs | share | reach |
|---|--:|--:|---|
| `consortium` | 138 | 48.1% | adaptive |
| `organisationType` | 95 | 33.1% | **staged — not asked today** |
| `entityCountries` | 63 | 22.0% | first page |
| `fteBand` | 58 | 20.2% | first page |
| `exclusionFlags` | 53 | 18.5% | adaptive |
| `useOfFunds` | 42 | 14.6% | first page |
| `region` | 24 | 8.4% | first page |

`organisationType` at 33.1% is the second-largest and `ARCHITECTURE.md` retires
it: *"buys nothing, and would have blocked SAP and Diehl Aerospace from schemes
they actually received"*. The reading above says why that is consistent rather
than contradictory — it separates the doors and does not separate the founder,
and forcing it to decide converts a difference into a wrong exclusion.

## 5. What our own per-leaf discriminators say about these pairs

The four scorers the sibling reassignment multiplies, evaluated on the two doors
alone. **Restricted to the pair**, so this is "do our discriminators tell these
two rows apart", not a replay of what the reassignment did over its full channel
group. `openFitScorer` is the fifth and is neutral by construction: it reads the
adaptive round's judgements and a replayed founder has none.

| scorer | has an opinion | favours the WON door | favours the SHOWN door |
|---|--:|--:|--:|
| `objective` | 7.3% | 4.5% | 2.8% |
| `award` | 38.7% | 5.6% | 33.1% |
| `region` | **0.0%** | 0.0% | 0.0% |
| `gateFit` | 5.6% | 2.4% | 3.1% |
| **all four together** | **48.1%** | 12.2% | 35.9% |

**On 51.9% of the pairs that cost us a founder, every per-leaf discriminator we
own is silent.** `region` is a clean zero on all 287 — `regionScorer` compares
only leaves sharing a `schemeCode`, and 61.3% of these pairs have no SA number
at all, which is `leaf_separation_wsAO.md` §1's "scoped to a group that barely
exists" measured on the population that matters rather than on the corpus.

`award` is the only one with much of an opinion and it points the **wrong way**
5.9 times out of 1 (33.1% against 5.6%): the door we show writes cheques closer
to the founder's stated band than the door they won. That is a real and slightly
uncomfortable result — it says ticket fit is actively selecting against the
answer on this population — and it belongs to whoever picks up `awardScorer`,
not to this file.

**35 pairs (12.2%) where our own preference favours the won door and we showed
the other.** Their pool ranks:

```
min 7   p25 14   MEDIAN 27   p75 72   max 94
  at rank 7 or better    0 / 35
  outside the 40 cut    11 / 35
```

None is within one place of the page and the median must climb 27 places, so
this is **not** a case of the preference reaching the ordering and something
after it removing the row. The preference is not reaching the ordering at all.
Whether that is the reassignment being skipped for those groups (it exits early
when `pref` is flat across the whole channel) or its slot pool being too coarse
is a separate question, and this file does not answer it — it only establishes
that the 12.2% exists and is not explained by peer precedence.

## 6. The one measurement this population cannot make, and it is the important one

`founderIntake` pins `useOfFunds` to `["industrial_research",
"experimental_development"]` for all 897 founders. That is deliberate and
correct: the only derivation available reads the register's `objectives_text`,
which is a statement about the SCHEME, and `objectiveScorer` ranks on exactly
that field — deriving it would let the signal grade itself, the shape of the
project-title leak that read 90% recall and was really 10%
(`leaf_separation_wsAO.md` §2).

So the 7.3% for `objective` in §5 is measured under a constant answer and is a
floor, not a headroom. The answer-independent half is not:

```
both doors declare a registered purpose            96   33.4%
  ...their GBER ARTICLES differ                    88   30.7%
  ...their USE OF FUNDS differ                     86   30.0%   <- the coarse half, the one the intake asks
exactly one door declares a purpose                15    5.2%
neither door declares one                         176   61.3%
```

**The corpus holds a different declared purpose for the two doors on 30.0% of
pairs, and the founder is asked for exactly that on the first page.** That is
the single largest identified, statable, already-collected separator on this
population, and this harness is constitutionally unable to price it.

The 61.3% with no declared purpose is the same 61.3% with no SA number — the
named-call block. Their separator is the description text, which we hold and
already embed.

## 7. What this means

- **Stop looking for a missing fact.** It exists on 287 of 287. Any workstream
  premised on "we do not hold enough about these funds to tell them apart" is
  premised on something this file measured false.
- **Stop expecting eligibility machinery to answer it.** The gates differ on
  94.1% of pairs and return `open / open` on 91.6%. Permission is not fit. This
  is a complete explanation for wsAO's +2-and-stop and for `organisationType`'s
  −0, and it predicts the same ceiling for any further gate work.
- **The two blocks need two different things.** For the 61.3% named calls the
  separator is topic, it is in the description on both sides, and the failure is
  that the ordering does not use it — which is a ranking question with the fact
  already in hand, not a collection one. For the 38.7% state-aid block the
  separator is the declared purpose, we hold it on 30.0% of pairs, we ask for it
  on the first page, and no replay on this population can measure what it is
  worth.
- **Two cheap, bounded corpus jobs fall out.** Eleven rows named after a ministry
  when the register holds their title (28 of 287 pairs touched, existing
  fetcher, free endpoint). And `application.url` blank on both doors for 88.9% of
  pairs — we cannot send a founder to the door we picked.
- **`award` selecting against the answer 33.1% to 5.6%** is the one thing in
  here that looks like a live ranking defect rather than a missing capability.

## 8. What this cannot see

- **The model.** `agentSelectMemoPool` re-orders the 40 before the cuts and every
  figure here is model-free, so the "shown" six are the deterministic order.
- **`watch_only`.** `isWatchOnly` reads the writer's prose and cannot be
  evaluated without a paid memo per founder.
- **The intake.** Every founder's answers are resolved from their own register
  history, `useOfFunds` is pinned, and `capitalSought` is withheld as neutral
  `[]` — so `capitalType`'s 4.5% is measured with the founder's own preference
  deleted, which production does ask for and send. A ceiling measured on these
  answers bounds THIS harness, not the product.
- **The second and third shown siblings.** Every pair figure is the won door
  against the HIGHEST-RANKED shown sibling, and 199 of 287 founders were shown
  three or more. `REPORT.md`'s last column is the strong form — the field
  separates the won door from EVERY shown sibling — and it tracks the pair
  column closely (`description` 98.3%, `eligibilityText` 93.0%).

---

## Files

- `README.md` — this finding.
- `REPORT.md` — the full column table, the gate block, named pairs, and example
  value differences. Produced by `scripts/_wsha_report.ts`, offline.
- `GATES.md` — the founder-conditional verdicts, the registered purpose, the four
  scorers, and the 35 inverted pairs. Produced by `scripts/_wsha_gates.ts`, free.
- `PAIRS.txt` — all 287 pairs in full, untruncated, sorted by regime. This is
  what §3's judgement was made by reading.
- `project-mgmt/evidence/wsha_door_pairs_2026-08-17.jsonl` — the working set, one
  JSON object per pair, with `both_known_diff` computed per pair.
- `project-mgmt/evidence/wsha_state_aid_doors_2026-08-17.jsonl` — sixteen SA
  numbers read off the Commission's own case API, 2026-08-17, with the name gap
  marked per row.
- `project-mgmt/evidence/wsha_named_call_doors_2026-08-17.jsonl` — Vinnova's own
  page on what separates one Strategic Innovation Programme from another.

## Reproduction

- **`scripts/_wsha_doors.ts`** — the measurement. Refuses `NO_PG`, refuses a
  non-Postgres store, asserts the draw equals the funnel's `13cb71cf3a1d1847`
  rather than printing it, and calls `requireCleanRanker` before anything is
  written to disk.
- **`scripts/_wsha_report.ts`** — the column table and the full pair dump.
  Offline, no credentials.
- **`scripts/_wsha_gates.ts`** — the gate and scorer analysis. Derived from the
  dump rather than re-measured: `founderIntake` is deterministic and offline, so
  the question costs one gate hydration instead of 897 embeddings.
- **`scripts/_wsha_evidence.ts`** — the JSONL. Offline.
