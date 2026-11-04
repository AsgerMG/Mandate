# wsHI — the ceiling that gates the next paid run, and the counter that reports it

**Nothing in this workstream spent a cent.** Every figure is recomputed from
runs already paid for. The replay is
`website/frontend/scripts/_wshi_tokens.ts`, which deletes every credential in
the environment and replaces `fetch`, `XMLHttpRequest` and `WebSocket` with
throwing stubs before it reads a byte — so an edit that reaches for the network
dies rather than spends. Its full output is `DISTRIBUTION.txt`.

---

## The answer, first

**The last ceiling was raised on the wrong evidence, and the field that misled
it is still in the tally line.** wsGS raised `medium` 6,144 → 12,288 on the
stated ground that wsGA's four truncations happened at forty rows, quoting that
run's own `depth=40`. They happened at **eighteen**.

| | |
|---|---:|
| founders wsGA called | 98 |
| of those whose recorded `menu` was 18 | **98** |
| largest pick index across all of them | 17 |
| largest accessible pool among them | 128 rows |
| `VERDICT_POOL` on the day wsGA ran (2026-08-12) | **18** |
| `VERDICT_POOL` from the next day (`7191f227`) | 40 |

`depth=` prints `SELECT_DEPTH` — a **cap**, which has read 40 on every recorded
run in this tree including wsDQ, months before the pool was forty rows. The menu
is `min(SELECT_DEPTH, pool)` and the pool is cut upstream by `VERDICT_POOL`. The
two have never been the same number, and the line only ever printed the one that
is not a measurement.

**So forty rows have never been bought at all**, and the ceiling in force was
sized on a menu less than half the length of the one shipping.

## The distribution, reconstructed from what was already paid for

Every per-call output figure this repo owns is a `reply_r1.txt` header — 12
exact observations at `high`, 12 at `low`. Everything else is an aggregate.

| | n | menu | cap | median | mean | **max** | % of cap |
|---|---:|---:|---:|---:|---:|---:|---:|
| wsDQ, effort=low | 12 | 18 | 1,536 | 28 | 60 | 339 | 22% |
| wsDS, effort=high | 12 | 18 | 12,288 | 6,973 | 6,633 | **10,596** | **86%** |

**`high` has never had headroom; it had luck.** Forty-six recorded calls at
12,288 with zero truncations reads as a comfortable ceiling and is not: the
largest single call came within 14% of it, on an eighteen-row menu.

Fitted lognormals (positive, right-skewed — the shape a ceiling is set against;
the quantile that matters sits beyond the largest sample here, so it is
projected rather than read off):

```
effort=high    mu 8.741  sigma 0.367   MLE on 12 exact observations
effort=medium  mu 7.627  sigma 0.529   mean 2,361 + censoring 4/210 at 6,144
```

**The two do not agree on spread, and that is reported rather than smoothed.**
The high fit is an MLE on a real sample; the medium fit is two summary
statistics off one tally line, and four censoring events pin a tail loosely.
Everything downstream uses the wider of the two at each effort — the direction
that cannot flatter the ceiling.

### A number that has to be recovered before it can be used

wsGA's line reads `4 CUT OFF at max_tokens` with no denominator, and its own
`thought on 210/148 call(s)` is the impossible ratio wsGS fixed. The denominator
is recoverable exactly: under `unsure=declare`, round two fires once per brief
that retrieved, and the line prints `62 brief(s) retrieved`. So 148 + 62 = **210
API calls**, which is precisely the numerator its broken ratio printed.

**`4 CUT OFF` is 1.90%, not the 2.70% the published line reads as — a 42%
overstatement of the number whose being non-zero voided the run.**

## The ceiling, derived against the abort condition rather than a quantile

The criterion is **not** a small truncation rate. wsHK's pre-registration makes
any truncation void the run, so the quantity to bound is

```
P(at least one truncation anywhere in the run) = 1 - (1 - p)^N
```

A p99.9 ceiling sounds ample and voids a 630-call run one time in ten. The bar
taken is **P(void) < 5% at N = 630** — three times wsGA's 210 API calls — under
the worst credible menu scaling, which is **linear in rows** (18 → 40, ×2.22).
Menu scaling is unmeasured; this is deliberately its pessimistic end.

effort=medium, linear scaling, P(the run is voided by truncation):

| ceiling | N=210 | N=630 | |
|---:|---:|---:|---|
| 12,288 (in force) | 99.8% | 100.0% | voids the run |
| 16,384 | 80.6% | 99.3% | voids the run |
| 24,576 | 14.1% | 36.5% | voids the run |
| 32,768 | 2.0% | 5.9% | voids the run |
| 49,152 | 0.1% | 0.2% | clears |

| effort | was | now | why this number |
|---|---:|---:|---|
| off | 1,024 | 1,024 | thinking is disabled here |
| low | 2,048 | 2,048 | max 339 of 1,536 over 12 calls; has never truncated |
| **medium** | 12,288 | **34,816** | smallest value clearing the bar |
| **high** | 16,384 | **57,344** | same bar, on high's twelve exact observations |
| xhigh | 24,576 | 96,256 | never run at any menu; the measured ×1.65 step continued |
| max | 32,768 | 128,000 | same step, clipped to claude-sonnet-5's own output cap |

`off` and `low` are untouched deliberately. Widening a ceiling that has never
bound buys nothing and worsens the worst case on the two rungs where a runaway
reply would be least expected.

**What it costs: nothing.** Output tokens bill only when used. **What it risks
is the owner's money, and only if a longer menu provokes longer thinking** —
which nobody has measured:

| scaling | mean out/call | EUR/call today | after 2026-08-31 |
|---|---:|---:|---:|
| none | 2,361 | 0.0217 | 0.0326 |
| log (×1.28) | 3,013 | 0.0277 | 0.0416 |
| **linear (×2.22)** | 5,246 | **0.0483** | 0.0724 |

wsGA billed EUR 9.2660 over 210 calls, of which thinking was EUR 4.49 — **48% of
the whole bill**. Under linear scaling a 1,000-call run costs EUR 71 instead of
EUR 44. The ceiling is free; the thinking is not.

## The counter, and why a zero can still lie

Two defects, one fixed and one that had not been noticed.

**1. The denominator.** wsGS fixed it and nothing tested it. A truncation
counter nobody can check is worse than none, because the next run clears its own
abort condition on its own say-so. `lib/intelligence/tallyDenominator.test.ts`
drives `agentSelectRows` with a scripted client and asserts on **the line** —
the artefact a pre-registration is judged on — not on the counters. The case
nobody had seen is one founder costing two API calls, one truncated:

```
old code:  1/1 CUT OFF at max_tokens     (100%, from a run that truncated half its calls)
new code:  1/2 CUT OFF at max_tokens
```

Proven red before green: reverting the two denominators and the menu field fails
**5 of 6** tests (`RED.txt`). The sixth is the control — three founders, one call
each, where both denominators agree. A test with one call per founder passes
under either, which is why nothing caught this.

**2. The clock, which is the hole the fix would otherwise have hidden.** A
ceiling the clock cannot reach never truncates: the call **times out**, and a
timeout lands in `exits.threw` while a truncation lands in `truncated`. wsDS
produced a 10,596-token reply inside high's then-150s wall, which bounds
throughput from **below** at 70.6 tok/s and therefore says nothing about whether
34,816 tokens fit. No recorded run states its own duration.

> **`truncated = 0` is not on its own evidence that the ceiling held.**

So the line now reports `slowest call Xms of Yms (Z% of the clock)`, and wsHK
voids on `exits.threw` and on exceeding 80% of the clock, beside truncation.
Timeouts are deliberately **not** moved: wsGS raised them one commit ago and
there is no measurement to justify moving them again.

## The guard, and the property that would have caught this

`check_maxtok_headroom.ts` already stated property 1 — *a ceiling measured to
bind may not remain in force*. wsGS satisfied it, with a number from the wrong
menu. So property 1 is necessary and not sufficient, and property 4 is added:

> **A CEILING SIZED ON A SHORTER MENU THAN THE ONE SHIPPING DOES NOT COUNT AS
> SIZED.** When a run that truncated is known to have shown fewer rows than
> `VERDICT_POOL`, the replacement must clear that run's ceiling scaled by the
> menu ratio — not merely exceed it. A truncating run whose menu is unknown
> licenses nothing.

It reads the menu from the line when the line states one, and otherwise from
`measured_menus.json` — menus **recovered from each run's own tape** by the
replay script. That file exists so an old record can be judged without being
edited: never touch the only copy of something that was paid for.

Both properties are proven red on the real record, not a simulation:

```
PROVE property 1 against the ceilings in force before wsGS:
  RED  …/adviser_medium_n773_x2.md  effort=medium maxtok=6144 truncated=4, ceiling then 6144

PROVE property 4 against the ceilings wsGS installed (which property 1 accepts):
  RED  …/adviser_medium_n773_x2.md  effort=medium maxtok=6144 menu=18 rows vs 40 shipping,
       ceiling then 12288, needs > 13654
```

And the check now prints the coverage line the owner needs before authorising:

```
menu coverage: 0 recorded run(s) at the 40-row menu that ships
  ██ THE CEILING HAS NEVER BEEN EXERCISED AT THIS MENU ██
```

That is not a failure and must not be made one: a menu nobody has bought cannot
be conjured by reddening a build, and failing there would only invite someone to
shrink the menu. **It is the line wsHK exists to flip.**

## Files

| | |
|---|---|
| `DISTRIBUTION.txt` | the replay's full output |
| `RED.txt` | the counter and menu tests failing on the pre-fix code |
| `measured_menus.json` | menus recovered from paid tapes, read by the guard |
| `../../wsHK_prereg.md` | the pre-registration for the run this gates |
| `scripts/_wshi_tokens.ts` | the replay — free, hermetic, re-runnable |

## Verification

`npx tsc --noEmit`, `npx vitest run` (58 files, 788 tests),
`npx tsx scripts/check_contracts.ts`, `npx tsx scripts/check_ws_scripts.ts`,
and `GUARD_NO_PUBLISH=1 PROVE=1 npx tsx scripts/check_maxtok_headroom.ts` — all
green.

## What this does not settle

- **Whether the ceiling is right above `medium`.** `high`, `xhigh` and `max`
  remain projected from eighteen-row evidence.
- **The menu-scaling relationship.** The linear assumption is pessimistic by
  choice, not measured. wsHK gives it two points at one effort; that bounds it
  and does not describe it.
- **Throughput.** No recorded run states its own duration. wsHK produces the
  first one.
