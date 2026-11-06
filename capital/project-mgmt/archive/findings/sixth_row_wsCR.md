# The sixth row is worth having, and finding it exposed something worse

**Workstream CR · 2026-08-09 · isolated worktree, branch `wsCR-sixth-row`.**

Reproduce (FREE — one Voyage embed and one Postgres read per pair, no model
calls):

```
cd website/frontend
SPLIT=tune    N=250 npx tsx scripts/_wscr_sixth.ts
SPLIT=holdout N=250 npx tsx scripts/_wscr_sixth.ts
```

Every figure below carries its attestation line and was re-measured AFTER
merging wsCO2's window corrections into this branch; both splits came back
identical pair for pair, so nothing here is bound to the older corpus.

---

## 1. Where the cap of five was encoded, and whether the copies agreed

Six places. **They did not agree, and two were already stale.**

| where | held | agreed? |
|---|---|---|
| `shortlist.ts` `DISPLAY_CAP` | 6 | — the screen, and the reason this workstream exists |
| `pipeline.ts` `BRIEF_INSTITUTION_CAP` | 5 | the cut |
| `briefChecks.ts` `BRIEF_LIMITS.institutionsMax` | 5 | the check on that cut, a SECOND copy of it |
| `contracts/brief/02-funds.md` FUND-2 | "five" | the writer's prompt, a THIRD copy |
| `scripts/memo_bench.ts` | `nInst > 5` | **STALE-BY-CONSTRUCTION** |
| `scripts/trace_pool.ts` | `min(deduped, 9)` | **ALREADY WRONG** |

The last two are the finding, not the edit.

`memo_bench.ts` hardcoded `> 5` three lines above its own comment explaining
that hardcoded caps there go stale the moment a contract changes one. It duly
did: the first six-row brief this project ever produced was reported by its own
quality harness as a SHAPE violation of a limit the product had already raised.
Its body-word cap was hardcoded at 700 in the same way.

`trace_pool.ts` printed the writer funnel as `min(deduped, 9)` while
`WRITER_CANDIDATE_CAP` had been 7 for months. Anyone reading that trace to
diagnose a thin brief was told the writer saw two candidates it never saw.

All six now resolve to `BRIEF_LIMITS.institutionsMax`, which is the one copy.
`check_contracts.ts` gains a guard that fails the build when the contract's
words and that constant disagree, and fails equally when NO contract states the
cap — proved by running both, not assumed.

## 2. What publishing six actually buys

wsCM's +2.8 came from `computeVerdict().instrumentTable`. **The memo does not
use that ordering.** It takes a wider pool (`VERDICT_POOL` 18, not
`DISPLAY_CAP` 6), re-ranks the whole thing on `scoreFit`, drops conclusively
blocked rows, collapses duplicate display names, and cuts what is left. So the
screen's headroom is evidence about a different list. Both are measured here,
in one replay, over the same pairs:

```
tune    n=250  seed 20260806  ranker: all 490 request(s) on EMBEDDING
  SCREEN@5 26.4  ->  SCREEN@6 30.0   +3.6      (wsCM read 26.8 -> 29.6)
  MEMO@5   12.8  ->  MEMO@6   15.6   +2.8

holdout n=250                 ranker: all 500 request(s) on EMBEDDING
  SCREEN@5 22.4  ->  SCREEN@6 25.6   +3.2
  MEMO@5   12.8  ->  MEMO@6   14.0   +1.2
```

**wsCM's screen figure reproduces.** The gain the change actually ships is
+2.8 tune / +1.2 holdout — real, positive on both splits, and roughly a fifth
of the base rather than a ninth of it, because the base is half what the
headline number implies. Call it **+2 points, not +2.8**, and expect it to move
when wsCQ lands.

**Regime concentration, beside the figure as the standing rule requires:** the
tune gain is 7 pairs across 7 distinct regimes and 7 countries; the holdout
gain is 3 pairs across 3 regimes and 3 countries. Largest single regime holds
one pair. There is no programme carrying this.

**A cut cannot publish a row that does not exist**, so: the memo's candidate
order has a sixth row for 180/250 founders on tune (72%) and 174/250 on
holdout (70%). Median depth 9, p25 4. For the remaining three in ten the change
is inert, which is the honest reason the gain is smaller than the screen's.

## 3. ██ The memo publishes a table half as good as the screen it follows ██

This is the real finding and it is not about the sixth row.

```
                                                    tune       holdout
won leaf inside the memo pool (top 18)              49.2%       50.0%
...and inside its first six BEFORE the re-sort      30.0%       25.6%
...and inside the memo order after re-sort + drop   15.6%       14.0%

in the pool but absent from the memo order            58          71
  attributed to VER-BLOCKED                           58          71
  attributed to anything else                          0           0

the fit re-sort moves the won leaf OUT of the top six  49          40
                                            INTO it    13          11
```

Two mechanisms, both live, both invisible to every published figure:

**(a) The eligibility assessment deletes the fund the company WON, 58 times in
250 tune replays.** Every one of the 58 is `VER-BLOCKED`: `assessAll` decided
an encoded gate conclusively fails for a company the award register records as
having won that exact scheme. This is the property
`check_winner_not_blocked.ts` exists to defend, one screen over — that guard
watches the TERRITORIAL screen and pins its debt at 15, and nothing watches the
gate screen at all, where the same class of error is running at four times the
volume.

It is confounded and must not be quoted as 58 real defects: this harness
supplies a synthetic profile (`activities: ["none"]`, `consortium: "yes"`, a
fixed `useOfFunds`) and wsCQ has established that 18 of 23 intake fields are
never supplied. A wrong answer produces a correct block. **wsCQ's harness is
what separates artifact from defect, and this number is the first thing to
re-measure when it lands.**

That it is not purely an artifact is shown by the bench run in §4: on the
SHIPPED intake, one of twelve archetypes has all 18 candidates blocked and
publishes an EMPTY table. Reproduced on `main` before this branch, so it is not
mine: `fteBand` fails an SME self-declaration gate on every scheme in that
company's pool.

**(b) The fit re-sort is negative on recall, by roughly 4 to 1.** Over the same
pool the screen's order holds the won leaf in six rows 30.0% of the time and
the memo's `scoreFit` order holds it 15.6% of the time. 49 moved out, 13 moved
in. Neither ordering has ever been measured against the other, because until
this workstream the memo's order could not run without paying for a brief.

**Worth 14 points, against the sixth row's 2.8.** Not touched here: it is a
ranking change, it needs its own workstream, and the standing rule is that
nothing a founder sees changes before it is measured end to end.

## 4. What six rows looks like

One real brief, `npx tsx scripts/memo_bench.ts --only "AI B2B software"`
(flagged: this is a full research + synthesis run, more than the two adaptive
calls budgeted). Rendered through the real `Memo` component and the real
stylesheet at `/brief/preview` and looked at in a browser.

**Six rows published, zero hard-check violations** — `checkBrief` returns `[]`,
including FUND-2 at the new cap. The sixth row cleared every check the first
five cleared, which is structural rather than lucky: the blocked drop, the
liveness screen and the name collapse all run BEFORE the cut, so row six is
screened identically to row one.

**It renders correctly and it reads badly.** The layout holds — the sixth row
is the same block as the others, the table closes cleanly, positioning and
state of play follow, nothing overflows. But at six rows the section is roughly
4,500px tall, and what fills it is repetition:

- rows 1 and 2 are the same ministry unit (BMWK IVA3) with near-identical
  next steps, two of six slots on one door;
- four of six carry word-for-word identical "How to apply" prose;
- all six show the identical three comparable firms;
- rows 3, 5 and 6 are a STEM-workforce ESF programme, a business-angel bonus
  and a 6G mobile-network call, for an AI infrastructure company;
- the institution column carries full German scheme TITLES with the ministry
  in brackets — `[BMWK, IVA3]`, `[BMDV]`, `[BMBF]`. FUND-7 says a ministry is
  not a door, "wherever the name appears". The check is a regex anchored at the
  start of the string, so it never fires on a name shaped like this.

**So: the memo does read as a list rather than as advice — and it did at five.**
Six makes an existing defect one row worse rather than creating one. The cause
is that each row is enormous and the rows repeat each other, not that there is
one too many of them. That is an argument for the runner-up framing the owner
declined, and a stronger argument for FUND-3 and FUND-7 being under-enforced.

## 5. Every other upstream/downstream cap mismatch, with its cost

| upstream | downstream | cost |
|---|---|---|
| `DISPLAY_CAP` 6 | `BRIEF_INSTITUTION_CAP` 5 | **the whole of this workstream.** Closed. |
| `WRITER_CANDIDATE_CAP` 7 | published 6 | headroom for writer rejections HALVED, 2 -> 1. Deliberately not raised: a thin table is a missing row, an uncovered candidate is a row published with template copy instead of judgement, and the second is worse. At 9 the writer measurably started omitting. Watch the thin-brief rate. |
| `POOL_LEAVES_PER_CHANNEL` 250 | `VERDICT_POOL` 18 | none — guarded by `check_leaf_cap.ts`, headroom positive. |
| `VERDICT_POOL` 18 | `DISPLAY_CAP` 6 | none — a pool wider than the display is the correct direction, and the backfill depends on it. |
| `check_peer_prior_canary` `VISIBLE` 5 | `DISPLAY_CAP` 6 | none, and deliberately so. Widening the window can only ADD hits, so re-deriving that floor onto six rows would loosen it without a number moving. Left at 5 with the reasoning written at the constant. |
| `check_recall_floor` `exact5` 15 | — | not re-derived. It measures the SCREEN, which did not change. The gap it exposes is that **no floor in this repo guards the memo's own row order**, which is §3, not a number to invent. |
| `fundSelection.ts` five picks, in 5 places | published 6 | latent, cost zero today: `selectFiveFunds` is imported only by `measure_pipeline.ts` and is not on the shipped path. If that gate ever ships it hard-caps below the published cap in the prompt text, the validator and the slice. |

## 6. Two things found while verifying, neither mine

- **`check_recall_floor` is flaky at a zero-margin floor.** `regime5` on
  `traced:exact_attribution` floors at 88 and read 87 then 88 on two runs of
  the SAME code hash (`2322f0a1db958197`), n=110. One pair either way decides
  the build. A floor that flips on identical code is not floored.
- **`memo_bench --sample 1` publishes an EMPTY table for one archetype**
  (§3a), reproduced on `main`. FUND-1 says at least one row always publishes.

---

## What was changed

- `lib/intelligence/briefChecks.ts` — `institutionsMax` 5 -> 6, and the one
  place the number lives.
- `lib/intelligence/pipeline.ts` — `BRIEF_INSTITUTION_CAP` derives from it.
- `contracts/brief/02-funds.md` — FUND-2 states six; the two other places the
  contract restated the count now state no number at all, so there is one
  numeric claim to guard rather than three.
- `scripts/check_contracts.ts` — the guard tying that sentence to the constant,
  stated over ANY rule of the form "at most `<n>` rows" so a rule added
  tomorrow is held to it with no edit here.
- `lib/intelligence/memoCandidates.ts` — new. The memo's candidate order,
  lifted verbatim out of `synthesize()` so it can run without a model call.
  Production calls it; the harness calls the same one.
- `scripts/_wscr_sixth.ts` — the measurement behind §2 and §3.
- `scripts/memo_bench.ts`, `scripts/trace_pool.ts` — the two stale copies.
- `scripts/check_recall_floor.ts`, `scripts/check_peer_prior_canary.ts` — a
  written re-derivation at each floor. No floor added, removed, raised or
  lowered.

`npx tsc --noEmit` clean. 342 unit tests pass. `check_contracts` ok, and PROVED
able to fail: reverting FUND-2 to "five" reds it, and deleting the sentence
reds it differently.

`check_winner_not_blocked` **PASS at 15 before and PASS at 15 after**, run on
`main` and on this branch. Identical by construction — the guard reads only the
committed answer key and `officialCatchments.generated.json`, neither of which
this branch touches.
