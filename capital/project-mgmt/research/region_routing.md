# Region routing: what separates the funds that share a name

Date: 2026-08-06. Workstream C (F in `rebuild_to_95.md`). Everything here is
measured against `data/db.sqlite`, the shipped artifact and the shipped scorer;
the commands are given so each number can be re-run and disagreed with.

## The finding that reframes the workstream

**The answer key was wrong for exactly the population this workstream exists to
fix, and that is why region "measured flat" every previous time.**

`__recallSet.json` traces a company's award to an instrument with
`scheme_code = call_id`. That join is not unique. One notified scheme delivered
by fourteen granting bodies is one SA number and fourteen instruments, so the
join returns the whole group and one member is picked. Checked against the
transparency register's own per-award attribution, on the holdout:

| population | register confirms the exact labelled leaf |
|---|--:|
| won fund NOT in a same-name group | **91.7%** (692/755) |
| won fund IN a same-name group | **32.2%** (75/233) |
| …the same rows, confirming SOME sibling | **96.1%** (224/233) |

The regime is right 96% of the time and the leaf is right 32%. The 278 holdout
pairs (23.8%) whose answer sits in a same-name group had their winners
distributed 9, 9, 8, 8, 8, 8, 7, 7, 6, 6, 6, 6, 6, 6, 5, 5, 5, 4, 4, 3 across
one French regime whose real award volumes differ by a factor of a hundred.
That is a uniform draw, not a ground truth.

**No method can beat chance on a population whose answer key is chance.** Same
rows, same scorer, two keys:

| answer key | region ranks the won body first |
|---|--:|
| shipped (`scheme_code = call_id`) | **24.9%** (uniform 23.1%) |
| repaired (register's `sa_number` + `granting_authority`) | **66.2%** (uniform 22.4%) |

`ETL/terms/repair_recall_attribution.py` emits `__recallSetRepaired.json`:
260 of 1,988 pairs relabelled, 251 of them to the single body the register
names. It is a new file; `__recallSet.json` is untouched.

## 1. How big is the problem

Same display name, same country, among leaves a founder could be shown:

| | groups | instruments |
|---|--:|--:|
| all leaves | **49** | **141** |
| …restricted to SATR (the audit's figure) | 43 | 119 |
| …restricted to leaves still open | 26 | 80 |

Size distribution: 36 groups of 2, 4 of 3, 5 of 4, one each of 6, 8, 9 and 14.
Together they carry 46,025 of 253,261 leaf events (18%), and **23.8% of holdout
pairs name one of them**. The mass is bimodal: two thirds of the groups are
pairs, and one third of the affected cases sit in the two largest French RDI
groups alone.

### What actually differs inside a group

Over the 248 within-group pairs, "observable" excludes pairs where either side
has no value, so coverage and separation are reported apart:

| field | separates | of observable | coverage |
|---|--:|--:|--:|
| `award_p50` (>=5 priced awards) | 237 | **99.6%** | 96.0% |
| `administering_body` | 165 | 80.5% | 82.7% |
| **modal recipient region** | 128 | **64.0%** | **80.6%** |
| delivery region (>=0.6 of own awards) | 51 | 73.9% | 27.8% |
| `capital_type` | 81 | 32.7% | 100% |
| `scheme_code` | 24 | 11.7% | 82.7% |

**46 of 49 groups have at least one field that separates every member outright**
— `award_p50` does it for 45. That number is a trap and should not be read as
"the problem is solved": a founder cannot answer a question about a fund's
historical award median beyond the ticket band they have already given, and
within a group registered once under one article the medians differ by noise as
often as by design. The columns that both differ **and** have a
founder-answerable counterpart are the recipient region and, weakly, the
administering body — and no founder knows which agency will handle their file.

Region footprint coverage: **112 of the 141** members carry one.

## 2. Is the register's region a fact about the company or about the scheme?

This is the load-bearing question. If the region a scheme reports is really the
scheme's own, then ranking schemes by it is circular.

Measured on the 8,479 companies holding awards under more than one notified
scheme, comparing what each scheme independently reports for the same company:

| level compared | self-agreement |
|---|--:|
| exact NUTS id | 79.0% |
| NUTS-2 prefix | 86.6% |
| **NUTS-1 prefix** | **94.4%** |

At the level a founder is actually asked — NUTS-1/2, which is what
`regions.generated.ts` carries — **it is a company property.** The 56%
self-agreement quoted in the brief for this workstream was computed on raw
region STRINGS: "München, Kreisfreie Stadt" and "Bayern" are the same place at
different NUTS levels and were being counted as a disagreement.

Confirmed a second way, end to end. Deriving the founder's region ONLY from that
company's awards under a **different** notified scheme — so no part of it was
reported by any scheme being ranked — does not degrade the result:

| founder region from | within-group @1 | @3 |
|---|--:|--:|
| every award, including the won one | 44.2% | 91.1% |
| **a different notified scheme only** | **49.4%** | **94.3%** |

The leak-free arm is the *better* one. The signal survives having its own
evidence removed.

## 3. What was built

**`ETL/lib/nuts_regions.py` → `staged_region_mix()`.** One attribution, two
callers: `populate_funding_instruments.py` (which writes the
`recipient_region_mix` / `delivery_region` columns) and the new emitter. A copy
in each would let the column shown to a founder and the score that chose the row
describe different corpora.

**`ETL/terms/emit_region_prior.py` → `regionPrior.generated.json`**, 395
instruments, built with `--exclude-recall-set`. Per leaf: every recipient NUTS
id with its count, plus `n` over all its awards including the ones the register
files at country level — the honest denominator, so a body with 40 regional
awards out of 4,000 reads as national.

**`regionPrior.ts`**, a leaf module (it touches `fs`, and three consumers need
it). `recipientsIn` answers "how many of this fund's recipients are where the
founder is", with containment by NUTS prefix — the register reports recipients
at level 3 and a founder answers at level 1 or 2, so equality would score every
such award as a miss.

**`regionScorer` in `shortlist.ts`**, applied inside the existing
rank-PRESERVING sibling reassignment, so it can only change WHICH sibling
occupies a slot and never move a regime in the table.

Three properties, each with a test in `regionPrior.test.ts`:

- **P(fund | region), not P(region | fund).** The count of recipients in the
  founder's region, not that count as a share of the fund's own size. The share
  form is the inversion `sectorFit` makes and measures worse here too (54.3%
  against 65.7% @1 on the same rows). A national body that placed 150 awards in
  Normandy IS a better answer for a Normandy founder than a regional body that
  placed 42, and the ground truth agrees.
- **Never across a channel.** The comparison is between leaves sharing a scheme
  registration — the group whose text, article and cheque size are identical by
  construction. Channel-wide it becomes a size prior in a geography costume.
- **Absent is neutral, never a penalty.** A leaf with no footprint scores 1.0,
  and a group where nobody has paid into the founder's region is left alone.

**`gateReach.ts`** now offers the region question from measured footprints
instead of from gates. This is the step without which the whole thing is inert
in production: only 148 of 958 instruments carry a `region_within` rule and the
groups where region is the only discriminator have **none** (ademe 0/75, vinnova
0/49, satr_fr_rnd 0/42), because siblings inherit one set of gates by
construction. Waiting for the gate layer to describe them is waiting for an
encoding that cannot exist.

**`computeAxes`** reports the real geographic split to gate 2's question writer
("8 distinct delivery regions over 14 funds … 4 deliver nationally, so region
does not exclude them") in place of a distinct-body count standing in for it.

## 4. What it is worth

```
cd website/frontend
NO_PG=1 npx tsx scripts/measure_region_routing.ts
SET=__recallSetRepaired.json REGION=any SPLIT=holdout N=200 npx tsx scripts/measure_recall.ts
```

**Within the group** — the question region exists to answer, holdout, through
the shipped artifact and the shipped scorer:

| population | n | region @1 | @3 | popularity @1 | uniform @1 |
|---|--:|--:|--:|--:|--:|
| all same-name cases | 269 | **44.2%** | **91.1%** | 28.3% | 25.0% |
| leak-free region only | 87 | **49.4%** | 94.3% | 32.2% | 27.7% |
| groups of 2 | 72 | 65.3% | 100% | 56.9% | 50.0% |
| groups of 3-5 | 58 | 65.5% | 98.3% | 29.3% | 29.3% |
| groups of 6+ | 139 | 24.5% | 83.5% | 12.9% | 10.2% |

**+15.9pp over popularity**, and the top three is 91% — on a population where a
founder previously chose between fourteen identical texts. The 6+ bucket is the
two large French regimes: @1 doubles the popularity baseline and @3 goes from
one in ten to five in six.

**End to end it does not move the headline**, and the reason is structural.
Paired — both arms in one process, same 120 same-name holdout cases, same
ranker, the ONLY difference being whether the founder answered the region
question:

| | EXACT@5 | REGIME@5 |
|---|--:|--:|
| without region | 7.5% (9/120) | 61.7% |
| with region | **9.2% (11/120)** | 60.8% |
| | 3 rescued, 1 broken | — |

Three to one in the right direction, and two cases out of 120. On the full
holdout, where same-name groups are 24% of cases, that is under half a point —
below the noise floor described next.

The binding constraint is NOT sibling availability. Measured on 60 of those
cases, mean group size 7.4: the won leaf is in the pool 55 of 60 times and
**7.0 of the group's members are in the pool with it**, so the scorer sees the
whole comparison it needs. What it cannot do is create a slot. The sibling
reassignment is rank-preserving by design — it holds each channel's multiset of
row scores fixed and only changes which leaf receives which — so region gives
the right door the best position the GROUP holds, and the group's best position
is usually outside the top five. Whether a channel gets a top-five slot at all
is decided upstream, by thematic relevance and the peer prior, and region is
deliberately not allowed to touch that.

**So the next step is not more region work.** It is that a same-name group
occupies at most one or two of five slots however well it is ordered
internally, and 61.7% of these cases do not have their regime in the table at
all. That is a pool-to-table problem, and it is where the remaining loss is.

### Why the single-run numbers in this session move, and what it means

`measure_recall.ts` returned 35%/87% and 31%/74% on what looked like the same
tree, twice each. It is not a harness defect: **another workstream was editing
this working tree throughout.** `peerPrior.generated.json` was rebuilt,
`THEME_SPREAD_FLOOR` moved 0.35 → 0.20 and `semanticSeparation` was rewritten,
all mid-session. Every one of those is in the ranking path, and `in pool` stayed
identical because none of them changes the candidate set.

The consequence is narrow but it must be stated. **Every single-run end-to-end
number produced in this session is uninterpretable**, including the ones above
compared across arms run minutes apart. Two classes of result survive:

- the **within-group** numbers (`measure_region_routing.ts`), which touch
  neither the peer prior nor the semantic index — they rank a fixed group with a
  fixed artifact and are unaffected by anything that moved;
- the **paired** number, because both arms run in one process against whatever
  code is loaded, so they cannot straddle an edit. That is exactly why
  `measure_description_lift.ts` was built this way, and the reason generalises:
  on a tree with more than one writer, only paired measurement is readable.

Two commits in this workstream (`5e24f70`, `ed20cd3`) used `git add -A` and
therefore carry files belonging to that other workstream —
`ETL/terms/attribution.py`, the `emit_peer_prior.py` and `extend_recall_set.py`
edits, the rebuilt `peerPrior.generated.json`, and `scripts/.tmp/`. They are not
part of region routing and are recorded here so the history is not misread.

Note also that the region scorer is **provably inert when no region is
answered** — `regionScorer` returns `() => 1`, and `pref` multiplies by it, so
the preference values are bit-identical and the group's early-out is unchanged.
No run made without `REGION=` can have been affected by anything in this
workstream.

## 5. Things tried that measured worse, so they are not retried

- **Widening the comparison group from "same registration" to "same name and
  country".** That is literally the group a founder cannot tell apart on the
  page, and it is the obvious thing to try, and it is worse: within-group @1
  44.2% → 40.1%, and on the groups of three to five it actually changes,
  65.5% → 43.1%. Two registrations of one regime really are two schemes with
  two sets of delivery bodies.
- **Capping each instrument's footprint at 40 companies**, as
  `emit_peer_prior.py` does. 24.9% → 24.0% @1. The cap exists there to stop a
  global prior returning the biggest funds to everyone; this score never leaves
  its scheme, so it cannot have that failure and pays for the cap anyway.
- **P(region | fund)**, the share form. 54.3% against 65.7% @1.
- Reading `satr_staging.region` as a scheme property and discarding it — the
  premise this workstream was handed. See §2.

## 6. What is still open

- **Region cannot be measured on programme-split children at all.** ADEME (75),
  BDNS (87), Vinnova (49) and Innovate UK (16) have no SATR footprint and, per
  `extend_recall_set.py`, are named by 0 of 1,988 recall pairs. The same
  measurement gap that blocks the corrected peer-prior join blocks this.
- **The repaired key is not the shipped key.** `__recallSetRepaired.json` is a
  new file and nothing reads it by default. Every number quoted against it must
  say so. It should become the default once the gate-2 fixture is rebuilt, and
  not before — rebuilding that fixture mid-comparison invalidates it.
- **29 of 141 same-name members still have no footprint**, and 310 of 1,988
  pairs no recoverable founder region. Both are register coverage, not method.
