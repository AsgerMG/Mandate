# wsHE §3 — does fixing it pay, end to end

Three runs of `_wsha_doors.ts` over the same 897 founders, same draw, same
store, same session (21:02–22:04 on 2026-08-17), each attesting
`ranker: all 828 request(s) on EMBEDDING`. `_wshe_arms.ts` refuses a pair whose
draw fingerprints differ, whose recorded arms agree, or either of whose rankers
was mixed.

The baseline reproduces `door_separation_wsHA/` to the founder — 774 gates-pass,
321 at six rows, 287 sibling misses, 388 same-channel — so nothing below is
compared across a corpus drift.

## The funnel, before and after

`measure_funnel`'s own ladder, rebuilt from the same path this harness walks.
Two rungs it cannot see are named rather than dropped.

| stage | mechanism | `shipped` | `off` | `oneside` |
|---|---|--:|--:|--:|
| the answer key names a fund this company won | `loadRecallSet` | 897 100.0% | 897 100.0% | 897 100.0% |
| ...publishable on the corpus's own facts | `publishableInstruments` | 828 92.3% | 828 92.3% | 828 92.3% |
| ...the founder's screen keeps it | UNMEASURED here — the doors harness does not record `rankTable` | ? | ? | ? |
| ...its encoded gates do not conclusively fail | `accessiblePool` | 774 86.3% | 774 86.3% | 774 86.3% |
| ...survives the cut to VERDICT_POOL (40) | `.slice(0, 40)` | 643 71.7% | 661 73.7% | **663 73.9%** |
| ...survives the cut to the writer's candidates (8) | UNMEASURED here — `orderMemoCandidates` is applied but its rank is not recorded | ? | ? | ? |
| ...is in the first 6 rows | the published order | 321 **35.8%** | 342 **38.1%** | 343 **38.2%** |
| ...is in the first 5 rows | the same order | 297 **33.1%** | 316 **35.2%** | 321 **35.8%** |

Every stage above the pool cut is IDENTICAL in all three arms, which is the
check that the arm did what it says: `awardScorer` touches ordering only, not
offerability and not the gates.

## The trade, beside the gain

| arm | depth | EXACT | REGIME | CHANNEL |
|---|---|--:|--:|--:|
| `off` | @5 | 33.1 → 35.2 **+2.1** (z 2.5, p .013) | 66.8 → 66.7 −0.1 (p .81) | 80.5 → 80.7 +0.2 |
| `off` | @6 | 35.8 → 38.1 **+2.3** (z 3.0, p .003) | 69.1 → 69.5 +0.3 (p .44) | 82.1 → 82.3 +0.2 |
| `oneside` | @5 | 33.1 → 35.8 **+2.7** (z 3.4, p <.001) | 66.8 → 67.2 +0.4 (p .16) | 80.5 → 80.7 +0.2 |
| `oneside` | @6 | 35.8 → 38.2 **+2.5** (z 3.4, p <.001) | 69.1 → 69.6 +0.4 (p .16) | 82.1 → 82.3 +0.2 |

**Not a wsBU trade.** wsBU's arm bought +0.7 EXACT@5 and paid −6 REGIME@5 and
−6 CHANNEL@5. This one pays nothing: REGIME moves +0.3 to +0.4 and CHANNEL +0.2,
both in the same direction as EXACT and both inside their own noise. Nothing is
being bought by hiding the right funder.

## The two arms are the same arm

| depth | measure | `off` | `oneside` | delta | McNemar |
|---|---|--:|--:|--:|---|
| @6 | EXACT | 38.1% | 38.2% | +0.1 | z 0.4, p .705 |
| @6 | REGIME | 69.5% | 69.6% | +0.1 | z 0.4, p .705 |
| @5 | EXACT | 35.2% | 35.8% | +0.6 | z 1.5, p .132 |

**The gain is attributable to removing the wrong-signed ordering, not to either
arm's shape.** The one-sided penalty on schemes paying far MORE than the whole
ask adds nothing measurable on top of deleting the term — which is what the
direction measurement predicted, since only 10.8% of won doors sit above the ask
at all.

## ██ THE CONCENTRATION, AND IT IS THE WHOLE STORY ██

| population | n | `shipped` | `oneside` | delta | gained / lost | z |
|---|--:|--:|--:|--:|--:|--:|
| ALL | 897 | 35.8% | 38.2% | **+2.5** | 32 / 10 | 3.4 |
| **excluding `vinnova_grant`** | 689 | 36.3% | 36.7% | **+0.4** | 7 / 4 | **0.9** |
| excluding all SE founders | 670 | 36.7% | 37.2% | +0.4 | 7 / 4 | 0.9 |
| **`vinnova_grant` only** | 208 | 34.1% | **43.3%** | **+9.1** | 25 / 6 | 3.4 |

The `off` arm splits identically: +9.1 inside Vinnova (z 3.4), +0.3 outside it
(z 0.5).

**Take Vinnova out and the arm is worth nothing measurable.** The aggregate
+2.5 is one regime — 23% of the population and 44% of the sibling cell —
carrying the entire move at +9.1 points, and the other twelve regimes
contributing +0.4 at z=0.9. Conversion rate by regime: `vinnova_grant` 18.2% of
its baseline misses, `ademe_aid` 11.1%, `satr_fr_rnd` **1.9%**.

### Why there, and why not elsewhere — the mechanism, not the excuse

This composes exactly with wsHA's own conclusion and is not a coincidence.

Vinnova is ONE regime with seventeen-plus leaf programmes, every one of them a
small grant — medians EUR 150k–330k against a derived band midpoint of EUR 1.1M.
So every Vinnova sibling sits in the "below the ask" region where the shipped
term is actively ordering them BY SIZE, which is noise with respect to which
programme a founder wanted. Neutralise it and the theme-and-sector score decides
instead — and Vinnova's programmes are genuinely thematically distinct, which is
precisely what wsHA found: *"for the largest block — Vinnova, 44% of the working
set — the separating fact is the founder's own line of business."*

The SATR regimes are the opposite case. Their siblings are transparency-register
text with near-identical descriptions, so removing the award ordering leaves
nothing better behind it to decide with. **The defect is everywhere; the payoff
is only where a better signal was already queued up behind it.**

That is a general property with a test for an unseen corpus: *this arm pays in a
regime whose leaves are separable by the founder's own words and whose award
medians all sit on one side of the ask. It pays nothing in a regime whose leaves
are not separable at all.*
