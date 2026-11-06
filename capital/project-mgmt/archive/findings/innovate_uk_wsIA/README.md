# wsIA — the model was obeying a sentence in our prompt that stopped being true on 2026-08-12

**The concentration is real, the diagnosis in the brief is not.** `innovate_uk`
does not own the harm list because it is British, because it floods the pool, or
because its doors are indistinguishable. It owns the harm list because its row
is the only row in the corpus that is **always rendered with a named obstacle
that is factually wrong**, and because the selector's prompt tells the model —
in a sentence that has been false for seven days — that spending a place on an
obstructed row is a wasted place.

The model did exactly what it was told. Our own score wins those founders
because it ignores the same instruction. **"The model is worse on innovate_uk"
is our prompt lying to it.**

Free. EUR 0.00 spent. No production writes.

---

## 1. FIRST, ADVERSARIALLY: is 7 of 11 what chance predicts?

**Half of it is, and the brief overstates the case by counting both runs.**

Harms live only in stratum C — the founders whose won fund our own score already
put in the six. The denominator is therefore the **called** C founders, not all
897, and not the 78. The brief's "11 / 10 founders" is the called total across
both strata, which is the wrong base.

| | wsHO | wsHW |
|---|---:|---:|
| called stratum-C founders | 35 | 33 |
| …of which `innovate_uk` | 11 | 10 |
| harms | 7 | 11 |
| …of which `innovate_uk` | 3 | **7** |
| expected if harms fell in proportion to presence | 2.20 | 3.33 |
| `innovate_uk` harm rate vs the rest | 27.3% vs 16.7% | **70.0% vs 17.4%** |
| **Fisher, one-sided** | **p = 0.381** | **p = 0.0059** |

**wsHO's concentration is nothing.** 3 of 7 when 2.2 is expected is exactly what
chance predicts, and the brief's "wsHO saw the same regime at the top of its harm
list with 3 of 7" reads a coin flip as corroboration. **One run carries the whole
signal.** If wsHW had come back like wsHO there would be no finding here.

What is *not* chance, in either run, is a structural fact nobody has stated:

> **All 109 `innovate_uk` founders in the population are stratum C. Every one.**
> There is exactly ONE instrument under that regime id, and our score puts it in
> the six for 100% of the founders who won it.

So `innovate_uk` **cannot be rescued, only harmed** — it is never in stratum R,
in either run. Any regime with that shape will head the harm list by
construction. That is half of the "concentration", and it is an artefact.

**The other half survives, and the separating variable is not the country.**

## 2. THE SEPARATING FACT: the qualification band, not the flag

Recomputed over the won row's rendered **qualification line** rather than its
regime — the won row's menu index is `poolRankControl - 1`, verified aligned on
**78 of 78** founders:

| won row rendered as | wsHO harm | wsHW harm |
|---|---:|---:|
| **"one thing in the way"** | 4/12 = 33.3% | **8/11 = 72.7%** |
| "nothing we can check rules them out" | 3/23 = 13.0% | 3/22 = 13.6% |
| | p = 0.163 | **p = 0.0014** |

It holds on the one non-British obstructed row in the sample too: **WISE SRL**
(`satr_it_rnd`) is obstructed and harmed in **both** runs. The property is the
band. `innovate_uk` is simply the instrument that is in it every single time.

### The behaviour, on ~2,900 rows rather than 11

Every row of every menu, both runs, bucketed by the ranker's own rank so the
comparison is not confounded by position:

| menu rank | band | rows | picked | |
|---|---|---:|---:|---:|
| **0–6 (the head)** | open | 451 | 222 | **49.2%** |
| **0–6 (the head)** | **obstructed** | **83** | **8** | **9.6%** |
| 7–13 | open | 438 | 117 | 26.7% |
| 7–13 | obstructed | 88 | 3 | 3.4% |
| 14+ | open | 1,532 | 178 | 11.6% |
| 14+ | obstructed | 241 | 8 | 3.3% |

*(wsHW. wsHO is the same shape: head open 44.9%, head obstructed 10.7%.)*

**At the head of the list the model takes an open row half the time and an
obstructed row one time in ten.** A 5x suppression on n=534 head rows. This is
not noise and it is not British — it is the single most reproducible thing in
either tape.

## 3. THE MECHANISM: the prompt promises a sort that was deleted

`lib/intelligence/agentSelect.ts:1873` tells the model, verbatim:

> *"your order is honoured WITHIN a qualification band, not across one: a row
> with a named obstacle is published below the rows nothing rules them out of,
> **whatever place you give it**. So spend your best places on schemes that are
> both open and right, and do not try to promote an obstructed scheme past an
> open one"*

**There is no such sort.** `lib/intelligence/memoCandidates.ts:615` records its
removal — *"the SORT ITSELF — pin rank, then verdict band, then incoming index.
Only the last of those three survives"* — and `pipeline.ts:1055` states it flatly:
*"There is no band sort, so there is nothing to protect them from."*
`publishRankByKey` (memoCandidates.ts:350) reads a positional index and nothing
else. The publish order is the model's pick order, truncated at six.

```
0ec572ff  2026-08-11  wsDL   the sentence enters the prompt   (band sort exists)
d452bfd1  2026-08-12  wsGB   the band sort is removed         (sentence not touched)
```

**Seven days of divergence, and wsHW's README explicitly certifies the prompt as
unchanged since wsHO** — *"the selector's prompt template is byte-identical to
wsHO's"* — which is true, and is exactly why the defect survived a re-read
designed to catch changes.

So the model, told its placement of an obstructed row is discarded, either
declines the row or parks it in the last seat as the best it can do. **AEROTEX
is the mechanism caught in the act**: the model picked `innovate_uk` at seat 7
of 7 — a demotion, precisely as instructed — and the six-row cut deleted it. Four
more of the seven harms are the model declining the row outright.

**The model is not wrong. It is correct against a false description of our
system.**

## 4. THE ENCODING DEFECT UNDERNEATH IT

Why is `innovate_uk` always obstructed? Two gates, live in Postgres today:

| gate | requirement | `value_spec.allowed` |
|---|---|---|
| `G3-01` | "Projects of **6 to 18 months** must have total eligible project costs between £100,000 and **£500,000**." | `lt25k, b25k_100k, b100k_500k` |
| `G3-02` | "Projects of **19 to 24 months** must have total eligible project costs between £100,000 and **£1 million**." | `lt25k, b25k_100k, b100k_500k` |

Both `gate_role: filter`. Both sourced from `innovate_uk_smart_grants_apr2024.html`
— **one competition page** — and applied to the umbrella instrument whose own row
reads *"a rolling programme of competitions"* over **17,012 real awards**.

**Three defects in two rows:**

1. **`G3-02`'s spec contradicts `G3-02`'s own text.** £1 million falls in
   `b500k_2m5`, which is absent from `allowed`. The encoder wrote the requirement
   correctly and then encoded the other branch's ceiling.
2. **The two are alternative branches, ANDed.** `assessInstrument` conjoins every
   filter; it has no notion of alternatives. A rule the applicant *selects into*
   by choosing a project length became a rule they must satisfy twice.
3. **The £100,000 floor is dropped in both** — `lt25k` and `b25k_100k` are
   allowed, which "between £100,000 and" excludes.

**Grounded, not inferred.** UKRI's own Smart Grants guidance and the April 2024
competition page state both windows: 6–18 months £100k–£500k; **19–24 months
£100k–£1 million, collaborative**. The requirement text is faithful; the spec is
not. Sources:
[UKRI Smart Grants funding guidance](https://www.ukri.org/councils/innovate-uk/guidance-for-applicants/guidance-for-specific-funds/smart-innovation-funding-guidance/) ·
[Smart grants: April 2024 competition overview](https://apply-for-innovation-funding.service.gov.uk/competition/1907/overview/d1149c8e-51ce-4b4e-b0b7-d780d32aa634)

**The collaborative condition is met by every affected founder.** All 10 called
`innovate_uk` founders answered *"able to run in a 3+ partner consortium: **yes**"*.
The £1m branch is open to all of them. **The obstacle is false for 10 of 10.**

### It fires on everyone, and it is the only one of its kind

- **All 112 GB founders in the population are `ticketBand: b500k_2m5`.** 109 of
  them won `innovate_uk`. The gate fires on **100%** of them.
- Live Postgres (9,763 gates): **exactly two instruments** carry a `ticketBand`
  `in` filter that excludes `b500k_2m5`. One is `bpifrance_innovup_leader_idf`,
  whose €75k–€500k ceiling is real and correctly encoded. **The other is
  `innovate_uk`, and it is wrong.**

`verdict.ts:150` already names this pair — *"`innovate_uk` carries `G3-01` and
`G3-02`, byte-identical ticketBand specs"* — and wsGE's by-field counting fixed
it as far as **blocking**. Nobody noticed it still renders as an **obstacle**,
which is the band the model was instructed to avoid.

## 5. WHAT IT IS WORTH

Within-sample counterfactual on the 78, holding the rescue side fixed and letting
obstructed won-rows harm at the rate open ones do:

| | wsHO | wsHW |
|---|---:|---:|
| observed delta | +1.66 | **−3.08** |
| obstructed harming at the open rate | +4.56 | **+5.33** |
| **swing** | **+2.90 pts** | **+8.41 pts** |

**Indicative, n=78, and it is a within-sample counterfactual — not a measurement.**
The honest reading is directional: this is the same order as the entire effect
the two paid runs were built to detect, and it is a defect rather than an effect.

**The exposure is not British.** **49 of 78 founders (62.8%)** carry at least one
obstructed row inside the ranker's own top 6. Every one of them is spending head
places on rows the model has been told to discount.

## 6. THE TRAP IN THE OBVIOUS FIX

Making the prompt true by **reinstating** the band sort would cost us more than
it saves. Measured on the same tapes: under a reinstated band sort **our own six
would lose the won fund on 10 of the 11 obstructed-won founders in wsHW** (11 of
12 in wsHO) — because our score's 39.02% EXACT@6 depends on publishing those
obstructed rows in the six. wsCT already priced the other direction: dropping the
band sort put an obstacle in 4.6% of published rows.

**The order to fix in is: the gate first, the prompt second.** Fixing the gate
makes both arms better and needs no ranking decision. Fixing the prompt is a
choice about what an obstructed row means, and it should be made on its own.

---

## PROPOSED CHANGES — NOT APPLIED, THIS IS A DIAGNOSIS

### (a) The prompt must not describe machinery that is not there

The property, with its test: **every sentence in a model-facing prompt that
describes what the system will DO with the reply must have an executing
counterpart, and the check is a reader's, not a matcher's — take each such
sentence and name the function that performs it.** A sentence that survives that
test unnamed is a lie to the model and costs exactly what this one cost.

Two candidate repairs, and the choice is the owner's, not mine:
- **delete** the band-sort paragraph, so the model's order is the order it
  believes it is giving; or
- **replace** it with what is true — that an obstructed row publishes at the
  place the model gives it, obstacle stated in the fund's own words — which
  makes the obstacle information rather than a penalty.

### (b) Alternative branches must be unioned, never conjoined

The property: **when one instrument carries several `filter` gates on the same
intake field and the fund's own text makes them branches the applicant SELECTS
INTO, the encoded spec must be their union.** The test for a case nobody has
seen: read the `requirement` texts. If each is scoped by a condition the
applicant controls — a project length, a strand, a lot, a competition round —
they are branches, and a founder who can satisfy any one satisfies the rule. If
they are properties of the applicant that hold simultaneously — "must be an SME",
"must be UK-registered" — they are a conjunction and stay one.

The exact production change, for a human to approve — **union of the two
grounded branches, floor restored**:

```
G3-01 / G3-02  instrument_id=innovate_uk  field=ticketBand
  from  {"op":"in","field":"ticketBand","allowed":["lt25k","b25k_100k","b100k_500k"]}
  to    {"op":"in","field":"ticketBand","allowed":["b100k_500k","b500k_2m5"]}
```

Reach: **109 of 897 founders (12.1%)**, all 112 GB founders in the population,
and 100% of them are in the band the current spec excludes.

**One caveat I could not close, and it should not be closed from the corpus.**
Both gates are read off a *single Smart Grants competition* and applied to the
whole Innovate UK agency. Whether the umbrella instrument should carry any
competition-specific cost window at all is a question for the official page and
the owner, not for me. The union above is the minimal grounded correction; the
larger question — a `programme_fact`, or a leaf per competition — is **unresolved
and flagged, not answered here.**

### (c) A caveat on (a) that I cannot settle from a tape

**Two instructions in the prompt push the same way and this evidence cannot
separate them.** Besides the band-sort sentence, the same block says *"a named
obstacle IS a fault, and a real one"* and *"a scheme whose stated demands this
company plainly fails is the wrong scheme even if it is near the top"*. Both are
TRUE statements and both would depress an obstructed row on their own.

So the 9.6%-vs-49.2% head suppression is attributable to the paragraph, not to
the one false sentence in it. **Deleting the false sentence may not recover the
whole swing** — and it should still be deleted, because a prompt that describes
deleted machinery is wrong whatever it is worth.

What separates them is free and already in the tapes for anyone who wants it:
`AEROTEX`'s seat-7 pick is the signature of the *band-sort* sentence
specifically — a model acting on "this row is a real fault" would decline the
row, not spend a seat parking it last. That is one founder, so it is a
hypothesis, not a measurement.

**The clean separation is a paid arm and I did not buy one.**

## WHAT IN THE BRIEF TURNED OUT TO BE WRONG

- **"7 of 11 with n=11 is small" — correct to worry, and the worry lands on the
  wrong run.** wsHW is p=0.0059. **wsHO is p=0.38, i.e. nothing.** The brief
  treats two runs as two witnesses; on this question there is one.
- **"Is innovate_uk over-represented in the pool?" — no.** One row, once, per GB
  founder's menu. It is not flooding anything. What *is* true, and is not in the
  brief, is that all 109 of its founders are stratum C, so it can only be harmed.
- **"Many near-identical doors rendered byte-identically" — no.** `innovate_uk`
  is a **single instrument id**, not a sibling family. The SA.40391 analogy does
  not apply. The model can tell it apart perfectly well; it was told to avoid it.
- **"Our score wins only because it is arbitrarily ordering indistinguishable
  rows" — no, and this is the useful correction.** Our score wins because it
  **ignores the qualification band entirely**. The model does not. The difference
  between the arms is not judgement, it is that one of them read the instructions.
- **"A diagnosable defect rather than a verdict on ranking" — right, and it is
  ours twice over**: a wrong gate, and a prompt describing deleted code. Neither
  is evidence about whether an LLM can rank.

## FILES

| | |
|---|---|
| `base2.py` / `base_rate.txt` | the base-rate arithmetic, called founders only |
| `prop.py` / `band_vs_harm.txt` | harm by qualification band, both runs |
| `allrows.py` / `pickrate_by_band.txt` | pick rate by band and rank, ~2,900 rows |
| `cf.py` / `counterfactual.txt` | the counterfactual, exposure, band-sort trap |
| `menu.py` | the menu parser (rows are **0-indexed**; `[0]` is the first row) |
| `_wsia_q*.mjs` | the read-only Postgres queries behind §4 |
