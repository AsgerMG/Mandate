# wsHO — ADDENDUM, written after the first paid probe and BEFORE the run

**`wsHO_prereg.md` IS NOT EDITED AND WILL NOT BE.** This is a separate file with
its own commit, so git carries the order in which the two were written. A
pre-registration revised once the numbers are in is a narrative with a
timestamp; a pre-registration that cannot record a fact discovered between
writing and running is a fiction. The difference is whether the original is
still there to be read, and it is.

## What happened

`wsHO_prereg.md` §4 declared `effort=medium`, wsGA's rung and wsHK's, and gave
its reason: the cost spread `tokens_wsHI` measured is a `medium` price and the
ceiling wsHI raised to 34,816 is `medium`'s.

**The first paid probe at `medium` made two calls. Both threw before a socket
was opened, at EUR 0.0000:**

```
[agentSelect] call failed, keeping the shipped order: Error: Streaming is
required for operations that may take longer than 10 minutes.
agent-select exits (2 call(s) to the seam): 2 the call threw, shipped order kept
```

The evidence is `findings/indicative_wsHO/medium_blocked.{md,json}` and its tape.

## Why, exactly

`@anthropic-ai/sdk@0.105.0`, `client.js:calculateNonstreamingTimeout`:

```js
const maxTime = 60 * 60 * 1000;              // 60 minutes
const defaultTime = 60 * 10 * 1000;          // 10 minutes
const expectedTime = (maxTime * maxTokens) / 128000;
if (expectedTime > defaultTime || ...) throw ...
```

So a NON-STREAMING request throws, client-side, when

```
max_tokens > 128,000 * (10/60) = 21,333
```

Against the ceilings in force after wsHI:

| effort | `MAX_TOKENS_BY_EFFORT` | > 21,333 |
|---|---:|---|
| off | 1,024 | ok |
| **low (SHIPPED)** | **2,048** | **ok** |
| medium | 34,816 | **THROWS** |
| high | 57,344 | **THROWS** |
| xhigh | 96,256 | **THROWS** |
| max | 128,000 | **THROWS** |

`agentSelect.ts` calls `messages.create` without `stream: true`. **Four of the
six rungs are therefore dead, and were made dead one commit ago.** The failure
is silent in the only way that matters: the call throws, `agentSelectRows`
catches it, the SHIPPED ORDER IS PUBLISHED, and the run reports the CONTROL's
number under the TREATMENT's banner at a cost of nothing. That is the exact
failure the arm attestation exists to catch, arriving one layer above it.

wsHI's own words were nearly right and pointed at the wrong mechanism: *"A
ceiling the clock cannot reach never truncates: the call times out first, which
lands in `exits.threw`."* It lands in `exits.threw`. Not because of the clock —
because the SDK refuses to send.

## What this run does instead, and why it is not a retreat

**The run moves to `effort=low`, which is the SHIPPED default** — the
coordinator's standing instruction for this run was *"Run the product AS
SHIPPED. Do not tune it first."* — and is the only rung that can make a call at
all today.

Everything in `wsHO_prereg.md` stands unchanged except §4's effort row. In
particular §5 (what counts as a direction, 15 called per stratum), §6 (the void
conditions) and §3 (the strata) are untouched, and §6 condition 2 is now read
against `TIMEOUT_BY_EFFORT.low = 40,000ms` rather than `medium`'s 150,000ms.

**The menu-scaling question `wsHO_prereg.md` §1 exists to answer is still
answered, and answered better.** `findings/first_test_wsDQ` holds twelve exact
per-call output observations at effort `low` on an **eighteen**-row menu
(median 28, mean 60, max 339). This run produces the same quantity at **forty**.
Those two are the same effort, the same seam and the same statistic, so their
ratio IS the menu-scaling factor that `tokens_wsHI`'s pessimistic "linear,
x2.22" stands in for — the first direct measurement of it in this repo. wsHI's
`medium` fit can then be rescaled by a measured number instead of an assumed
one.

**What is NOT answered, and is now a different question entirely:** what a
`medium` call costs at forty rows. It cannot be bought at any price until
`agentSelect.ts` streams or the ceiling comes down below 21,333 — and
`tokens_wsHI`'s own bar (P(any truncation in a 630-call run) < 5% under linear
menu scaling) is met at 32,768 and NOT at 21,333. **So that bar cannot be met at
all without streaming.** That is a finding, not a gap.

## Budget

The `medium` probe cost EUR 0.0000 — it never reached the network. The `low`
probe cost EUR 0.1138 over three calls. The cap is unchanged: **EUR 4.00 total**,
and the run below is railed at EUR 3.55 so that every euro this workstream has
spent, including both probes, stays inside it.
