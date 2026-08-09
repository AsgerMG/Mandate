# Ranking was closed on evidence that could not name its ranker. Re-opened, attested, and mostly re-closed — with one exception that matters.

**Workstream CS · 2026-08-09 · isolated worktree off `main` at `9374b372`.**

wsBU measured every signal alone and blended, concluded **"nothing beats the
shipped ranker outside its half-width"**, and that conclusion was relayed to the
owner as settled. The wsCP audit then found all four `signal_remeasure_wsBU_*`
artifacts were produced **before `rankerTallyLine` existed** — inside the window
where `semanticFundMatch` could time out under load and every `rankerUsed` call
site silently dropped to the lexical index, which is how `check_recall_floor`
returned 87% and then 96% on identical inputs the same day.

So the route was shut by an unproven null. This re-runs it.

Reproduce (FREE — one Voyage embed and one Postgres read per pair, no model
calls). **Run them ONE AT A TIME and read the tally line**: a loaded machine
averages two rankers and prints one number.

```
cd website/frontend
N=600 SPLIT=tune    SEED=20260806 FEATURES_OUT=/tmp/tune.json    npx tsx scripts/measure_signal_power.ts
N=600 SPLIT=holdout SEED=20260806 FEATURES_OUT=/tmp/holdout.json npx tsx scripts/measure_signal_power.ts
TUNE=/tmp/tune.json HOLDOUT=/tmp/holdout.json                    npx tsx scripts/fit_signal_blend.ts

SPLIT=tune N=600 OUT=/tmp/head.json npx tsx scripts/_wscs_seats.ts
PEER_FILL=confident      SPLIT=tune N=600 OUT=/tmp/conf.json     BASE=/tmp/head.json npx tsx scripts/_wscs_seats.ts
PEER_FILL=confident-both SPLIT=tune N=600 OUT=/tmp/confboth.json BASE=/tmp/head.json npx tsx scripts/_wscs_seats.ts
```

Terminal output for every run is committed beside this file as
`ranking_reopen_wsCS_*.txt`. **Every one attests `ranker: all N request(s) on
EMBEDDING`.** No run that failed to attest appears here, and none was discarded
— all of them were clean.

---

## 0. What old-against-new can and cannot tell you

The corpus moved between the two studies. wsCO's window corrections took the
answer key's GRADED share from **95.5% (6,779 pairs) to 85.7% (6,083)**, and
the holdout population's composition with it (original join 164 → 205, childless
family 156 → 145, exact attribution 280 → 250).

> **So a difference between wsBU's table and this one is not a measurement of
> what attestation changed.** It is two answer keys. The columns are printed
> side by side below because the owner asked for them, and read as "does the
> conclusion survive", which is a question they can answer. They cannot answer
> "was wsBU's number wrong", and nothing here claims they do.

The one thing that IS clean: this study's tune run was executed twice, hours
apart, and returned **24.3% pair for pair both times** with 1,154 embedding
requests both times. The harness is deterministic when it attests.

## 1. Every signal alone — old against new, holdout, N=600

EXACT@5, ties resolved by expectation, 95% half-widths, baseline computed on
these same pools rather than remembered.

| signal | wsBU (unattested) | **wsCS (attested)** |
|---|--:|--:|
| random baseline | 5.6 ±0.4 | **5.6 ±0.3** |
| *SHIPPED — the product's own five* | *21.2 ±3.3* | ***23.0 ±3.4*** |
| collaborative prior (peer) | 21.2 ±3.3 | **22.6 ±3.3** |
| semantic (founder's own text) | 16.2 ±2.9 | **20.7 ±3.2** |
| sector share, unclipped | 18.1 ±3.1 | **19.3 ±3.1** |
| shipped pool score (theme+sector) | 15.6 ±2.9 | **18.8 ±3.1** |
| sector share (shipped, clipped) | 15.7 ±2.0 | **17.8 ±2.2** |
| shipped score, siblings by sector count | 13.8 ±2.8 | **16.0 ±2.9** |
| proximity (home country) | 10.4 ±1.6 | **10.4 ±1.5** |
| encoded gate count | 8.5 ±2.0 | **8.9 ±2.1** |
| sector count (posterior over pool) | 6.2 ±1.9 | **8.3 ±2.2** |
| recency (last award year) | 6.0 ±0.5 | **6.3 ±0.5** |
| total EUR | 4.2 ±1.6 | **4.7 ±1.7** |
| event count | 4.0 ±1.6 | **4.3 ±1.6** |
| company count | 4.0 ±1.6 | **4.3 ±1.6** |
| award median | 3.5 ±1.5 | **3.7 ±1.5** |
| award scale fit | 4.2 ±1.6 | **3.2 ±1.4** |
| eligibility (encoded gates) | 1.3 ±0.4 | **1.4 ±0.4** |

**Not one signal changes rank order against SHIPPED, and not one moves outside
its own half-width.** Every wsBU finding on this table stands:

- Metadata is not noise — the best arms run at 3-4x a computed baseline.
- **No single signal beats the shipped ranker.** Collaborative prior 22.6 ±3.3
  against SHIPPED 23.0 ±3.4, the same tie wsBU reported, for the same reason:
  `applyPeerPrecedence` means the two arms are largely the same mechanism.
- Everything about a fund's SIZE still runs at or below a shuffle (event count
  4.3, company count 4.3, total EUR 4.7, award median 3.7, baseline 5.6).
- `eligibility (encoded gates)` is still FAR below baseline at 1.4 ±0.4. Ranking
  by how open a fund's encoded rules look is worse than random, because "open"
  is a statement about what we have ENCODED.
- `recency` is still a shuffle (6.3 ±0.5 against 5.6 ±0.3).

**On the per-signal table, "ranking is closed" survives measured properly. That
is a confirmed null and it closes the single-signal route for good.**

## 2. The blend is NOT inside the noise, and the reason is the comparison

wsBU: blend 22.7 ±3.4 against SHIPPED 21.2 ±3.3, read as "+1.5 against
half-widths either side, not a difference". Here, same fourteen features, same
conditional logit, **fitted on tune and reported on holdout once**:

```
EXACT@5 blended, on tune (FITTED THERE — not a result)   26.3 ±3.5
EXACT@5 blended, on holdout (the reported number)        28.0 ±3.6
SHIPPED, the same 600 founders                           23.0 ±3.4
random baseline on the same pools                         5.6 ±0.3
```

Two marginal intervals printed beside each other answer *could these two
populations differ*. The question is whether **the same founders** do better,
and every arm in this harness shares a draw, a pool and a denominator precisely
so that comparison is available. The dump was discarding the one column it
needed. Carried now:

```
PAIRED delta blend − shipped        +5.0 ±3.4 points
discordant 108                      blend only 69, shipped only 39
```

McNemar on 69/39 is z = 2.9. **The margin excludes zero, and it did not in
wsBU because wsBU compared two marginal intervals rather than the pairs.** This
is a defect in the comparison, not evidence that the old number was wrong.

**Concentration, as the standing rule requires:** gains spread over **21
regimes**, the largest 22% of the gained mass; losses over **20 regimes**,
largest 18%. This is not seven leaves in one regime.

The blend's weights are nearly identical to wsBU's — proximity 3.49 (wsBU
3.91), unclipped sector share 2.51 (2.08), semantic 1.47 (1.49). The model is
stable across two answer keys; only the way it was scored changed.

### What the +5.0 is NOT

1. **It is not a shippable +5.0.** The blend is scored as a pure re-ordering of
   the pool. The product's five are subject to the channel cap, the scheme
   dedupe and peer precedence, none of which this arm pays for. wsBU's own
   un-clipping arm is the warning: **+0.7 EXACT@5 while costing 6 points of
   REGIME@5 and 6 of CHANNEL@5**, and 98% → 83% REGIME@5 on exact attribution.
   Nothing here has measured that trade for the blend, so the honest reading is
   an UPPER BOUND on what a pure-score reordering could buy.
2. **It is unstable in magnitude.** On the split it was fitted on, the same
   comparison is +2.0 (26.3 against 24.3), not +5.0.
3. **The largest weight is on a term the row score does not contain.**
   `rowRelevance` is `wTheme·theme + (1−wTheme)·sectorFit` and has no home-country
   term at all; the blend's top weight is proximity. That is the concrete,
   nameable, untested lever this study leaves behind. It is not shipped and it
   is not measured end to end.

## 3. Whether it crosses a 24% gap — the direct answer

wsCM: misses are scattered, not near, with the won leaf a median of **24.4% of
the fifth row's score** below it and a median rank of **22**.

```
of the 386 pairs the product MISSED, the blend puts 69 in the five   (18%)
median rank of the won fund, under the blend, on those it does NOT reach   22
```

**No.** The blend collects the near edge of the distribution — a fifth of the
misses — and leaves the median miss **exactly where the shipped ranker left it,
at rank 22.** The gap that wsCM measured is not crossed by anything in this
study, and a reader should not read +5.0 points as progress against it. It is
progress against the near fifth, and the remaining four fifths are untouched.

## 4. The seat allocation: can it depend on the score's confidence?

wsCM closed the FIXED splits (`all` 27.6 / `head` 26.8 / `alternate` 24.8) and
read the gradient as flat at the top. Flat **on average** is not an answer to
whether the score's reserved seat is worth something where the score has an
opinion and negative where it does not. No fixed split can express that
difference, so those three arms could not have found it either way.

`scoreSeats` makes the count a function of the table: **the score keeps the
leading rows it SEPARATED**, where separated means the drop to the next row
exceeds the mean adjacent gap of that founder's own table. Scale-free, no
threshold, no fit, and nothing in it names a fund, country or sector. Two arms,
both default-off: `confident` on the flat branch (the 80%), `confident-both`
also replacing the fixed 3 on the specific branch, where `descriptionIsSpecific`
is a **proxy** for exactly the confidence this reads directly.

Tune, N=600, seed 20260806, every run attesting:

| arm | EXACT@5 | delta | seat count differs | discordant | gains / losses |
|---|--:|--:|--:|--:|---|
| `head` (shipped) | **24.5 ±3.4** | — | — | — | — |
| `confident` | 24.7 ±3.4 | **+0.2** | 359/600 (60%) | 23 | +12 / −11 |
| `confident-both` | 24.5 ±3.4 | **0.0** | 472/600 (79%) | 44 | +22 / −22 |

Reported on holdout ONCE, `head` against `confident`, no arm having been
adjusted in between:

| arm | EXACT@5 holdout | delta | seat count differs | discordant |
|---|--:|--:|--:|--:|
| `head` (shipped) | **23.0 ±3.4** | — | — | — |
| `confident` | 22.8 ±3.4 | **−0.2** | 332/600 (55%) | 12 / −13 |

(`head` on holdout reads 23.0% here and 23.0% as the SHIPPED arm of §1 — two
independent harnesses, same draw, same number.)

**The arm arrived and did work.** The seat count changed for 60% and 79% of
founders respectively — this is not a flag that failed to reach the module,
which is the shape of every false null in this repo, and it is why the seat
distribution is reported beside the metric rather than the metric alone.

Concentration: `confident`'s 12 gains over 7 regimes and 11 losses over 6;
`confident-both`'s 22 gains over 12 regimes and 22 losses over 10. Both are
population-wide noise, not a regime effect either way.

### Why it is flat, which is the actually useful part

Read the seat distribution against the outcome, and it is monotone in the wrong
direction — the same shape on both arms:

```
                confident            confident-both
 0 seats   273 founders  27.8%    332 founders  27.1%
 1 seat    123           23.6%    157           21.0%
 3 seats   139           22.3%     26           19.2%
 4 seats    13            0.0%     16            6.3%
 5 seats     8            0.0%     10            0.0%
```

and the same shape on holdout, which is what makes it a property rather than a
tune artefact: 0 seats 25.0% (n=248), 1 seat 21.4% (145), 3 seats 18.6% (140).

> **The more sharply the score separates its top rows, the LESS often the won
> fund is on the page.** A confidence-weighted seat allocation therefore hands
> seats to the score in precisely the founders where the score is most often
> wrong, and takes them away where it happens to be right. The two effects
> cancel, which is the +0.2.

That is a mechanism, not a shrug, and it generalises past this arm: **any rule
that gives the score more authority where it is more confident is pushing on
the wrong end of this relationship.** Score confidence is not evidence of score
correctness here; if anything it inverts. `SEATS_ARE_NOT_A_CONFIDENCE_QUESTION`.

**Nothing ships. `PEER_FILL` stays `head`.**

## 5. Leak status — which figures are leak-free

**All of them.** `npx tsx scripts/check_recall_leaks.ts` green, output committed
as `ranking_reopen_wsCS_leaks.txt`. Specifically:

- 0 of 1,366 described rows leak at exact / 8-gram / sibling; 0 begin with the
  instrument's own name (it was 1,573 of 1,920).
- Only the `semantic` arm and the blend read the founder's text at all. Every
  other arm is instrument-side metadata and cannot leak a description it never
  sees.
- The collaborative prior is out-of-sample by construction: `emit_peer_prior.py`
  drops every company in every `__recallSet*.json`, not behind a flag.
- The seat arms read no description at all; they reorder a table already built.

## 6. What this means

- **The single-signal route is now closed on attested evidence.** Eighteen arms,
  N=600, holdout, leak-free, every one within its half-width of where wsBU put
  it. This is the confirmed null, and it is worth having.
- **The blend route is NOT closed, and was closed in error** — by a marginal
  comparison of a paired question, not by a bad number. +5.0 ±3.4 paired, over
  21 regimes. It is an upper bound and it has an unmeasured REGIME/CHANNEL cost.
- **The nameable lever it points at is that the row score has no home-country
  term** while the blend's largest weight is one. Untested end to end.
- **Confidence-dependent seat allocation buys nothing, and now we know why:**
  the score's confidence is anti-correlated with its correctness. Do not
  re-propose any rule that scales the score's authority with its own certainty.
- **The 24% gap is not crossed by anything here.** 18% of misses collected;
  median unreached miss still at rank 22.

### What changes if `usedInField` becomes live (wsCQ)

wsCQ is fixing the harness: 18 of 23 intake fields are never supplied and every
founder is replayed as `"TestCo"`, so `fieldChannels` is empty and tier 1 of the
row comparator — a channel-level boolean **above the entire score** — is true on
0 of 3,810 rows in every number above.

- §1 and §2 would have to be **re-run**, and the blend most of all: it is
  competing against a SHIPPED arm whose top tier is switched off. A live tier 1
  can only help SHIPPED, so **+5.0 is the optimistic end and could close
  entirely.**
- §4 would **not** change in direction. The seat arms operate below the
  comparator, on a table tier 1 has already ordered; a live tier 1 changes which
  rows are in front but not the finding that the score's separation
  anti-predicts its correctness. The absolute EXACT@5 would move.
- §3's answer would not change: 18% of misses is a property of the miss
  distribution's shape, and tier 1 does not compress it.

---

## What was changed

- `website/frontend/scripts/measure_signal_power.ts` — attests the ranker;
  the feature dump carries the attestation, the per-pair SHIPPED outcome and
  the answer's regime.
- `website/frontend/scripts/fit_signal_blend.ts` — REFUSES a dump that carries
  no attestation and one that attests a fallback; reports the paired delta
  against SHIPPED, the regime concentration of gains and losses, and the 2x2
  against the misses.
- `website/frontend/lib/intelligence/shortlist.ts` — `scoreSeats`;
  `PEER_FILL=confident` and `confident-both`, default `head` bit for bit; `all`
  loses its duplicated branch, being seat count 0 of the general form.
- `website/frontend/lib/intelligence/tableTrace.ts` — `recordScoreSeats`, off
  unless a diagnostic armed it, read by nothing in the ranking path.
- `website/frontend/lib/intelligence/peerFill.test.ts` — **the suite was
  vacuous.** Every test passed `"DE", "deeptech"`; there is no `deeptech`
  sector, so `peerPrior` returned empty and `applyPeerPrecedence` took its early
  return. The permutation invariant, the winner-not-blocked check and every arm
  sweep were asserting that a function returning its argument returns its
  argument. Now on `DE|software_data_ai`, with a test that the prior is
  non-empty and one that the table is REORDERED, so it cannot go vacuous again.
- `website/frontend/scripts/_wscs_seats.ts` — new; the A/B behind §4.

`npx tsc --noEmit` clean. `check_recall_leaks.ts` ok. `check_recall_floor.ts`
ok, all floors met, attested; committed as `ranking_reopen_wsCS_floor.txt`. **No
floor added, removed, raised or lowered.** Full unit suite green.

**Guards proved able to fail, each by running it:**

- `fit_signal_blend.ts` against a dump with `ranker` deleted → throws; against
  one carrying `47 FELL BACK TO LEXICAL` → throws; against a clean pair → fits.
- `PEER_FILL=nonsense` → throws, rather than falling back to `head`.
- `PEER_FILL=confident` with no score supplied → throws, and the check sits
  BEFORE the early return so a caller that forgot it fails on every table
  rather than only on the ones with a peer prior.
- `peerFill.test.ts` green under all five arms, and its non-vacuity test fails
  if the peer prior cell ever empties.
