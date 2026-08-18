# wsHO — a forty-row call costs 4.6 cents and 96% of it is the prompt; the ceiling above `low` could not be sent at all; and the model's ordering is a wash

**FOR THE OWNER, VERBATIM.** Three euro sixty-nine bought all three answers. **A
forty-row call at the shipped settings costs EUR 0.0459 a founder, and 95.6% of
that is the PROMPT — thinking is 4.4%.** So the EUR 0.0217–0.0483 spread that
was blocking the decision was a spread about the wrong quantity: it came from
not knowing how much the model would think, and thinking is a rounding error at
the rung that ships. **The full run is EUR 30.70 for the 669 founders whose
answer is on the list, EUR 41.16 for all 897, and after the 31 August price
change EUR 46.05 and EUR 61.74.** Second: **the run is trustworthy, and the
reason it nearly wasn't is worse than truncation.** wsHI raised the `medium`
ceiling to 34,816 tokens; the Anthropic SDK **refuses to send any non-streaming
request above 21,333** and throws before opening a socket. My first two paid
calls threw, at EUR 0.0000, and `agentSelect` caught them and **published the
shipped order** — a run that would have reported our own score under the model's
name and billed nothing. Four of six effort rungs were dead. They are fixed, and
a guard now asks the SDK itself. At the rung that ships, 0 of 85 calls truncated,
nothing threw, and the slowest used 65.5% of the clock. Third, **the model's
ordering is a wash.** It rescues 25.6% of the founders it can rescue (n=43) and
damages 20.0% of the ones it can only damage (n=35), which reweights to **+1.7
points of population EXACT@6, 95% interval −5.8 to +9.2 — and removing ONE
regime, seven founders in `satr_fr_rnd`, turns it into −1.5.** INDICATIVE, n=78.
On this evidence EUR 30.70 buys a coin flip, and the thing to fix first is not
the ranking: **48% of the model's picks fail the prompt's own two disqualifiers,
and 39% still do on founders who had plenty of qualifying rows to choose from.**

---

```
run                 2026-08-18, isolated worktree wsHO-indicative, ONE session
population          897 founder(s) — held out, described, one per company, drawn
                    BEFORE the offerability cut
draw fingerprint    13cb71cf3a1d1847   <- asserted in code, IDENTICAL to
                    one_funnel/latest.md, door_separation_wsHA/ and wsHE
corpus              postgres instruments=1088
ranker              all 828 request(s) on EMBEDDING          <- attested AND enforced
strata              R 324 / C 345 / D 159 / U 69   — reproduces one_funnel exactly
called              78 founder(s), 85 API calls, 0 fell back, 78/78 chose
SPEND               EUR 3.5792 (run) + 0.1138 (pricing probe) + 0.0000 (the
                    medium probe never reached the network) = EUR 3.6930 of a
                    EUR 4.00 HARD CAP
pre-registered      project-mgmt/wsHO_prereg.md, committed 87d39ca6 BEFORE the
                    first paid token; wsHO_prereg_addendum.md, committed
                    e0ecfb39 BEFORE the run, records the one lever that moved
                    and why. THE ORIGINAL IS NOT EDITED.
reproduce           GUARD_NO_PUBLISH=1 AGENT_SELECT=adviser AGENT_SELECT_EFFORT=low \
                      AGENT_SELECT_UNSURE=declare WALK=897 MAX_EUR=3.55 OUT_TAG=main \
                      npx tsx scripts/_wsho_strata.ts
                    npx tsx scripts/_wsho_harvest.ts        (free, offline)
```

**INDICATIVE, AND THAT IS THE DESIGN.** This is the first run under the owner's
standing policy — *"can we not just do indicative runs now and then once we have
something that looks like a final product then we do a full run to test?"* Every
figure carries its `n=`. **Nothing here may reach the dashboard headline; that
is `one_funnel` and nothing else.**

---

## The lever set, because a paid figure without it is not reusable

Read from the SHIPPED constants, not from `process.env`.

```
arm adviser · seam late · AWARD_TERM oneside · PROFILE_BLOCK complete
POOL_BLEND off · ROW_PROXIMITY off
VERDICT_POOL 40 · SELECT_DEPTH 40 · menu = min(depth, pool)
SELECT_COUNT 7 · SELECT_COUNT_MODE exactly · AGENT_SELECT_UNSURE declare · LOOKUP_MAX 5
WRITER_CANDIDATE_CAP 8 · published_cap 7 · shown 6
AGENT_SELECT_EFFORT low · max_tokens 2048 · clock 40,000ms
```

`AWARD_TERM=oneside` and `PROFILE_BLOCK=complete` were flipped in the last two
days and **no model had ever seen either.** This run is their first. Everything
above is the live default; nothing was tuned for the measurement.

---

## 1. WHAT A FORTY-ROW CALL COSTS — and the spread was about the wrong thing

| per API call | n | mean | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| output tokens, all menus | 85 | 201 | 30 | 999 | 1,891 |
| output tokens, **menu = 40 exactly** | 70 | **215** | 30 | **1,017** | **1,891** |
| of which thinking | 85 | 170 | 0 | 965 | 1,857 |
| **input tokens** | 85 | **21,882** | 22,195 | 27,537 | 30,558 |

At `claude-sonnet-5`'s rates ($2 in / $10 out per Mtok, USD→EUR 0.92):

| | per API call | share of the bill |
|---|---:|---:|
| input | EUR 0.0403 | **95.6%** |
| output, thinking included | EUR 0.0018 | **4.4%** |
| **total** | **EUR 0.0421** | |
| **per founder** (1.09 API calls each) | **EUR 0.0459** | |

**`tokens_wsHI`'s 2.2x spread was a spread about thinking, and thinking is 4.4%
of the bill.** Triple it and the price moves 9%. The prompt is what a forty-row
call costs, and the only lever that moves it is the number of rows.

### The full run, priced

| run | founders | API calls | EUR today | EUR after 2026-08-31 |
|---|---:|---:|---:|---:|
| this one | 78 | 85 | 3.58 | 5.37 |
| **in-pool population** (669 of 897) | 669 | 729 | **30.70** | **46.05** |
| whole population | 897 | 977 | **41.16** | **61.74** |

### And the menu-scaling question, answered — the wrong way

`first_test_wsDQ` holds twelve exact per-call output observations at the SAME
effort on an **eighteen**-row menu. Same statistic, same seam, same rung:

| | menu 18 (wsDQ, n=12) | menu 40 (here, n=70) | ratio |
|---|---:|---:|---:|
| median output tokens | 28 | 30 | 1.07 |
| **mean** | 60 | **215** | **3.6x** |
| **max** | 339 | **1,891** | **5.6x** |
| calls that thought at all | 2/12 | 21/85 | 17% -> 25% |

The menu grew **2.22x** and the mean grew **3.6x**. **Menu scaling is SUPER-linear,
so `tokens_wsHI`'s "linear x2.22, the pessimistic end" was optimistic.** The
median barely moved: forty rows does not make every call think, it makes more
calls think and makes the thinking calls much longer.

> **The consequence lands on the one rung wsHI deliberately left alone.** It kept
> `low` at 2,048 because "max 339 of 1,536 over 12 calls; has never truncated" —
> a statement measured at eighteen rows. **The largest reply here was 1,891 of
> 2,048: 92.3% of the ceiling that ships.** It did not truncate. It has almost
> no room left, and the next widening of the menu takes what is left.

---

## 2. CAN THE RUN BE TRUSTED — yes, and the near miss was not truncation

Every void condition in `wsHO_prereg.md` §6, checked and printed:

| condition | | observed |
|---|---|---|
| `exits.threw` is zero | ok | 0 |
| slowest call ≤ 80% of the clock | ok | **26,217ms of 40,000ms = 65.5%** |
| no call cut off at `max_tokens` | ok | **0/85 API calls** |
| ranker attestation clean | ok | `ranker: all 828 request(s) on EMBEDDING` |
| fell back on ≤ 5% of calls | ok | 0 of 78 |
| both arms handed the same pool array | ok | 78 of 78 |
| `menuMax` is 40 | ok | 63 of 78 at exactly 40; the rest have shorter pools |

**This is the first live exercise of wsHI's truncation denominator**, and it is
right: 85 API calls over 78 seam calls, so the two denominators genuinely differ
and the line reports each counter over its own. `check_maxtok_headroom`'s
coverage line has flipped from `0 recorded run(s) at the 40-row menu that ships`
to **4**.

### The defect that would have made a paid run report our own score

The first two calls this workstream tried to buy were at `medium`. Both threw,
**at EUR 0.0000, before a socket was opened**:

```
[agentSelect] call failed, keeping the shipped order: Error: Streaming is
required for operations that may take longer than 10 minutes.
agent-select exits (2 call(s) to the seam): 2 the call threw, shipped order kept
```

`@anthropic-ai/sdk@0.105.0`, `client.js`:

```js
const expectedTime = (60 * 60 * 1000 * maxTokens) / 128000;
if (expectedTime > 10 * 60 * 1000) throw ...      // max_tokens > 21,333
```

| effort | ceiling wsHI installed | sendable? |
|---|---:|---|
| off / **low (SHIPPED)** | 1,024 / 2,048 | ok |
| medium | 34,816 | **THROWS** |
| high | 57,344 | **THROWS** |
| xhigh | 96,256 | **THROWS** |
| max | 128,000 | **THROWS** |

`agentSelect.ts` does not stream, so **four of six rungs were dead** — and dead
in the one shape no counter can tell from success: the call throws, the catch
publishes the shipped order, and the run reports the CONTROL under the
TREATMENT's banner having billed nothing. **Production was never affected**
(`AGENT_SELECT_EFFORT` defaults to `low`), but every paid measurement above
`low` was — including the one **wsHK is pre-registered to run and must not run
until this is read**.

Fixed here, two ways:

1. `caps.ts` — the ladder is brought inside what the transport carries:
   `medium 14,336 / high 16,384 / xhigh 18,432 / max 20,480`. `off` and `low`
   are untouched, so production is byte-identical. `medium` still clears the
   13,654 that `check_maxtok_headroom` property 4 demands.
2. `check_maxtok_headroom.ts` gains **property 5 — a ceiling the transport will
   not carry is not a ceiling, it is an outage.** It reads whether the seam
   streams and then asks the SDK's own `calculateNonstreamingTimeout` whether it
   would send each value, so the boundary is never retyped and an SDK upgrade
   moves the guard with it. Proven red on the real ladder:
   `PROVE=1` prints `4 of 6 rung(s) rejected`.

**`tokens_wsHI`'s own bar — P(any truncation in a 630-call run) < 5% — needed
32,768 and is therefore UNREACHABLE on a non-streaming request at any value.**
Restoring wsHI's ladder is one line, `messages.stream(...).finalMessage()`, and
property 5 lifts itself the moment it lands. That is a real workstream and it is
not this one.

---

## 3. WHICH WAY THE MODEL'S ORDERING POINTS — INDICATIVE, n=78

### The strata, and why a random sample would have wasted two thirds of the money

Computed free, before either arm ran, on this run's own walk of all 897 — and
reproducing `one_funnel/latest.md` founder for founder:

| stratum | what the model can do to it | of 828 gradable | called |
|---|---|---:|---:|
| **R** | **RESCUE** — won fund in the forty, not in our six | 324 (39.1%) | **43** |
| **C** | **HARM ONLY** — won fund already in our six | 345 (41.7%) | **35** |
| D | nothing — won fund not in the forty | 159 (19.2%) | **0, by design** |

**C is carried deliberately.** A run that samples only R measures gain and can
never measure harm; it reports the numerator of a fraction.

### The two rates

| | n | count | rate |
|---|---:|---:|---:|
| **rescue** — the won fund enters the six under the model | 43 | 11 | **25.6% +/-13.0** |
| **harm** — the won fund LEAVES the six under the model | 35 | 7 | **20.0% +/-13.3** |

```
delta = s_R * rescue - s_C * harm = 0.391*0.256 - 0.417*0.200
      = +1.68 points of population EXACT@6      95% interval  -5.84 to +9.20
```

Paired, on the called set, for comparability with wsGA:

```
EXACT@6  McNemar(signed) z = +0.94  on 18 discordant (model 11, our score 7;
         both 28, neither 32)  exact p = 0.481
POOL rank, Wilcoxon: n=63 non-tied, mean shift -1.44, z = -0.15, p = 0.883
```

### CONCENTRATION — and it decides the sign

wsHE's standard, applied: **remove one regime and the direction flips.**

| | n called | rescue | harm | delta | 95% interval |
|---|---:|---:|---:|---:|---|
| all | 78 | 25.6% | 20.0% | **+1.68** | −5.84 to +9.20 |
| **minus `satr_fr_rnd`** (7 founders) | 71 | 18.9% | 20.6% | **−1.50** | −9.38 to +6.39 |
| minus `innovate_uk` (11 founders) | 67 | 25.6% | 16.7% | +6.06 | −1.59 to +13.70 |

- **rescues: 11 across 6 regimes**; largest `satr_fr_rnd`, 4 = 36% of them.
- **harms: 7 across 5 regimes**; largest `innovate_uk`, 3 = 43% of them.

> **THE HONEST READING: the model's ordering is a wash.** The point estimate is
> positive, the interval spans zero on both sides of it, and the sign is decided
> by seven founders in one French regime. It changed the outcome for 18 of 78
> founders and, netted against the population, moved nothing that can be
> distinguished from nothing. **Buying the full run at EUR 30.70 on this evidence
> is buying a coin flip.**

---

## 4. THE FREE HARVEST — what the replies say, and it is not what wsDY found

Nobody in this repo had held real replies at a forty-row menu. `HARVEST.txt` is
the whole output; `_wsho_harvest.ts` reproduces it offline and free.

### Seat pressure fell by more than half, and it does not explain the picking

`_wsdy_slots.ts` measured **2.1 of 18 rows** surviving the prompt's own two
disqualifiers, with 10 of 12 founders holding fewer qualifying rows than seats.
The same two disqualifiers, applied the same generous way, at forty:

| | wsDY, menu 18, n=12 | here, menu 37.8 mean, n=78 |
|---|---:|---:|
| mean surviving rows | 2.1 | **11.5** |
| surviving SHARE of the menu | 11.7% | **30.4%** |
| founders with fewer survivors than the 7 seats | 10/12 (83%) | **26/78 (33%)** |

**So the widening did what it was supposed to: it multiplied the qualifying rows
5.5x and cut the population under seat pressure from five in six to one in
three.** And then:

| | founders | picks failing the prompt's own two rules |
|---|---:|---:|
| **ample** — 7 or more survivors, NO seat pressure | 52 | **142 of 364 = 39.0%** |
| **tight** — fewer survivors than seats | 26 | 122 of 182 = 67.0% |
| all | 78 | **264 of 546 = 48.4%**, on 69 of 78 founders |

> **Seat pressure explains part of it and nowhere near all of it.** On founders
> with plenty of qualifying rows to choose from, two picks in five still fail the
> money or theme rule the prompt itself states. **So `atMost` is worth an arm and
> it is not the main story:** it reaches at most a third of the population, and it
> cannot touch the 39%.
>
> Reported as an upper bound in the model's favour, exactly as wsDY did: a row
> with no award median counts as the right size and a row with no descriptor
> counts as on-theme. And it is a PROXY — the prompt states more criteria than
> these two, including a most-won prior that explicitly invites reaching
> off-theme. Read the 39% as "the two stated disqualifiers do not describe how
> it picks", not as "39% of picks are wrong".

### What the model says, and the answer is: nothing

- **Reasoning text exists on 18 of 78 founders.** At the SHIPPED rung the model
  usually emits none — so **the self-report wsDY's finding rests on, "the
  requirement is to return exactly six selections regardless of fit quality",
  DOES NOT EXIST IN PRODUCTION.** It came from effort `high`. That is why every
  number above is measured from the CHOICE instead.
- **1 of 85 transcripts** matched any of twelve seat-filling phrasings, and it
  is a weak match — *"Other Horizon clusters like energy (CL5) and bio-based
  (CBE) are weaker matches for this project profile"* — an ordinary comparison,
  not an admission.
- **The one hedge the reply contract admits — `unsure` — fired on 7 of 78 briefs
  (9.0%), naming 17 rows.** wsGA got it **0 times in 24 calls** at eighteen rows.
  A forty-row menu is the first thing to make the model say it cannot tell two
  funds apart, and round two therefore fired 7 times, which is the whole of the
  85-vs-78 gap in the call count.

---

## Files

| | |
|---|---|
| `main.md`, `main.json` | the run's own report and its summary, unedited except that `rows[].turns` are stripped from the JSON — they are kept IN FULL in the tape beside it, which is the copy of record |
| `main_tape.jsonl` | one line per founder, flushed as it went — every prompt, reply and reasoning block that was paid for |
| `HARVEST.txt` | `_wsho_harvest.ts` in full |
| `medium_blocked.{md,json}` | the two `medium` calls that threw, kept as the evidence |
| `low_probe.{md,json}` | the three-call pricing probe |
| `../../wsHO_prereg.md` | the pre-registration, unedited |
| `../../wsHO_prereg_addendum.md` | what changed before the run, and why |
| `scripts/_wsho_strata.ts` | the harness — one pool object, a control stratum, a euro rail |
| `scripts/_wsho_harvest.ts` | the free offline harvest |

**One known defect in `main.md`:** the two `+/-` figures in the rescue/harm table
are printed 100x too large (a percentage multiplied by 100 twice). The correct
values are **+/-13.0** and **+/-13.3** and they are stated correctly above; the
underlying counts in `main.json` are unaffected and the formatting is fixed in
`_wsho_strata.ts`. The paid artefact is left byte-for-byte as it was written.

## Verification

`npx tsc --noEmit`, `npx vitest run` (59 files, 806 tests),
`npx tsx scripts/check_contracts.ts`, `npx tsx scripts/check_ws_scripts.ts`,
`GUARD_NO_PUBLISH=1 PROVE=1 npx tsx scripts/check_maxtok_headroom.ts` — all green.

## What this does NOT settle

- **Anything at an effort above `low`.** Nothing above it could be sent while
  this run was made. The cost, the ceiling and the ordering are all `low`'s.
- **Whether forty beats eighteen.** That is wsHK's question, it has one menu
  here, and wsHK cannot run as written until the streaming decision is taken.
- **Significance.** n=78 and the interval spans zero. This is a direction, and
  the direction is "no direction".
- **The writer.** Every figure is the code-side projection, `orderMemoCandidates`
  cut to six. The finished brief is downstream of it.
