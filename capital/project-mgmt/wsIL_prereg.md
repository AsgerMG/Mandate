# wsIL — the pre-registration for telling the comparable search what the founder answered

**Written and committed before the first paid token, and before any run is
scheduled.** Nothing in this file may be edited once a call has been made
against it. If it turns out to be wrong it gets an addendum, the way wsHO's
did — a pre-registration revised once the numbers are in is a narrative with a
timestamp.

Branch commit at the time of writing: `743316a4a68312f1894a5107d52d9322527f93de`.

---

## 0. THE FINDING THAT COMES BEFORE THE ARM

**Every free instrument in this repo measures a pipeline in which this stage
does not exist.**

`_wsgd_stages.ts:185` — which is what `npm run stages` runs — builds
`fieldChannels` from `dbPeers` alone and passes `records: []`. So does
`_wsdr_curve.ts:112`, which generated the committed pool-recall curve the
selector's own prompt quotes. So does every one of the ~30 harnesses in
`scripts/`. Production does not: `pipeline.ts:1836` unions in the channels of
every web-found comparable that resolves in the corpus.

Two consequences, and both are larger than the missing fields.

**The funnel number is measured on a pipeline the founder is not served.** The
comparable search is a paid stage on every brief, it feeds `fieldChannels`, and
`fieldChannels` seeds `codes` in `selectInstrumentRows` — *which channels are in
the pool at all* — and sets `usedInField`, which is **tier 1 of the row sort,
compared above the entire score** (`shortlist.ts:3312`). The one end-to-end
measurement runs with that contribution set to empty.

**And therefore no free run can grade this arm.** Not "poorly" — at all. The
only harnesses that reach `discoverAndResearch` are the ones that call
`runIntelligence`: `memo_bench`, `funnel_bench`, `_wsdq_run`, and the dot-file
harness at the frontend root. Everything else is structurally blind to it.

That is why this file exists, and it is also the reason §4 recommends buying
much less than an end-to-end run.

---

## 1. THE CLAIM, STATED SO IT CAN FAIL

> **Telling the comparable-company search what the founder answered about their
> company changes which comparables the corpus can match, and changes them for
> the better: more DB-matched peers, or the same number drawn from a more
> relevant part of the corpus.**

The negation is not "no effect". It is the specific, plausible harm:

> **Four extra constraints narrow a similarity search that is deliberately
> broad, so the model names companies that fit the constraints and fewer of
> them exist in the funding corpus. `fieldChannels` shrinks toward the fixed
> `DEFAULT_INSTRUMENTS` list, and the founder's table becomes more generic, not
> less.**

## 2. THE MECHANISM, STATED BEFORE ANYTHING IS WIRED

The search prompt asks for five European companies "operating in a similar
field at a similar altitude", preferring ones "likely to have drawn on public
support". Today the model is told the company name, its country, the model's
own tech-depth read of the description, and the founder's fenced prose.

The chain from that prompt to a published row:

```
ctx -> [web search, STOCHASTIC] -> <=5 names
    -> matchCompany [deterministic]     -> k matched  (unmatched names are DROPPED,
                                                       hard rule, user 2026-07-09)
    -> their channels UNION selfRecord UNION dbPeers  -> fieldChannels
    -> codes in selectInstrumentRows                  -> POOL MEMBERSHIP
    -> usedInField                                    -> TIER 1 OF THE ROW SORT
    -> [adviser ranker, STOCHASTIC] -> [writer, STOCHASTIC] -> the table
```

Plus a fifth path nobody had written down: when the founder is **not** in the
corpus — which is most startups — the modal sub-sector of the *matched web
peers* is what `findPeersBySubsector` is asked for. The paid search chooses
which neighbourhood the DB-native peers come from.

**How the extra fields would change the output.** Three claims, in decreasing
order of confidence:

1. **`developmentStage` and `fteBand` are the only fields that state altitude,
   and the prompt asks for altitude.** A founder's prose says what they build;
   it rarely says "10-49 people, pilot customers with revenue". This is the
   field pair with genuine marginal information over the description, and it is
   the reason to run the arm at all.
2. **`useOfFunds` moves the search toward peers who drew on public money for
   the same *purpose*,** which is closer to the channel signal we actually
   consume than "same sector" is. Capex-for-first-deployment peers sit on
   Innovation Fund / EIB / national development banks; R&D peers sit on Horizon
   and EIC.
3. **`sector` is the weakest of the four in production and the strongest on the
   harness,** which is §4's problem and not a small one.

**How it hurts, and what would show it.** The stage's value to everything
downstream is *the number of names that DB-match*. Unmatched names contribute
nothing — not a row, not a channel, not a sub-sector vote. A more constrained
search that names five companies which are a better conceptual fit but a worse
corpus fit is strictly worse here. **The falsification is therefore direct: the
treatment produces fewer DB-matched peers than the control, paired, on the same
founders, on the same day.** If that happens the arm is harmful and the run
stops there.

Two smaller ways to lose, recorded so they are not rediscovered as surprises:

- **`intakeFactLines` would have been the wrong block.** It renders every
  answered field, most of which describe the founder's standing under aid law
  rather than the company. "Accumulated losses over half of subscribed capital:
  yes" cannot make any candidate more or less comparable — no candidate's
  public profile carries it — and putting it under a search instruction invites
  the model to read the block as a filter. What is wired instead is the
  property in `comparableFacts.ts`: *a fact may be told to this stage only if
  the same fact could be stated about one of the companies it is asked to
  return.* Ten of twenty-six fields pass.
- **The block is framed as evidence, not as a specification.** The rendered
  lines are preceded by "Use it to judge whether a candidate is at a similar
  altitude in a similar field. It is NOT a filter." That sentence is part of
  the treatment and must not be edited between this file and the run.

---

## 3. THE FREE PROMPT DIFF, ON THE 897

`npx tsx scripts/_wsil_ctx.ts` — no credentials, no database, no network, no
model call. It renders both arms out of `comparableSearchContext`, the function
production itself calls.

```
population 897 held-out described founders, one per company
the context DIFFERS on 897 of 897 (100.0%)
added lines per founder   min 3 median 3 max 3
added characters          median 591  (control median 497)

field              reaches   distinct   disposition
sector             100.0%          11   varies
ticketBand         100.0%           4   varies
useOfFunds         100.0%           1   CONSTANT -- reaches the prompt, separates nobody
developmentStage     0.0%           0   ABSENT for everyone -- cannot be measured here
fteBand              0.0%           0   ABSENT for everyone
turnoverBand         0.0%           0   ABSENT for everyone
balanceBand          0.0%           0   ABSENT for everyone
organisationType     0.0%           0   ABSENT for everyone
foundedYear          0.0%           0   ABSENT for everyone
activityCountries    0.0%           0   ABSENT for everyone

of the 10 admitted fields the harness can put a value on 3.
a real first screen sends 5.
```

**Read that table before reading anything else in this file.** The treatment
more than doubles the context (497 -> 1088 characters) and on this population
it reduces to **`sector` (11 values) and `ticketBand` (4 values), plus one
sentence identical on all 897.** The two fields carrying the mechanism —
`developmentStage` and `fteBand` — are `WITHHELD` in `founderIntake.ts` for
every founder, with a stated reason ("we hold no headcount for any company";
"no TRL or maturity fact about a company"), and no honest arm can invent them.
`useOfFunds` is `pinned` uniform, so it lengthens every prompt and separates
nobody.

**And the one varying field the harness *can* supply is the one whose marginal
value the harness inflates.** On the recall set `description` is a project
title or a cross-regime summary (`descriptionSource: own_project_title`,
`own_award_text`, `cross_regime_summary`) — not a founder's own account of
their company. `sector: Energy, cleantech or environment` carries far more new
information beside "Agile and Cognitive Cloud edge Continuum management" than
beside three sentences a founder wrote about their business. So the harness
measures a treatment that is **both weaker than the product's and biased upward
on its largest varying component.** A positive result would be hard to
attribute; a null would be uninterpretable.

That is the honest reading and it is the reason for §5.

---

## 4. THE PRIMARY OUTCOME — argued, not copied

Two precedents pull in opposite directions and **this arm is neither of them.**

- **wsII** made reciprocal rank primary because EXACT@6 cannot be powered: on a
  model-vs-control contrast its half-width floors near 4.1 points at any
  affordable price.
- **wsIJ** refused recip as primary because its arm was **recip-neutral by
  construction** and agreed with control on ~60% of founders, which shrank the
  between-founder variance enough to power EXACT@6 at 2.56.

wsIJ's argument does not transfer, in either direction:

- Its arm was applied **after** the reply was parsed, so one call bought both
  arms and the contrast was exactly zero on most founders. **This arm is
  upstream of everything.** It changes the prompt of a live, non-reproducible
  web search — `_wsdq_run.ts:22` says so in as many words — so nothing is free
  and nothing is zero by construction.
- Its arm was pool-invariant. **This one is not.** It moves `codes`, so it
  moves pool membership; and it moves `usedInField`, so it moves the top tier
  of the sort. It is not recip-neutral either.

So neither precedent's conclusion applies. What decides it is the chain in §2:
**between the lever and the published order sit three stochastic stages** — the
web search itself, the adviser ranker (which wsII measured disagreeing with
itself on 12–22% of founders against *identical* prompts), and the writer. And
the lever's effect is **conditional**: it is exactly zero for every founder
whose treatment search happens to yield the same DB-matching set, and that
share is unknown.

Averaging a conditional effect over 897 divides it by that share. Measuring it
at the end of a three-stage stochastic chain adds the churn of all three. Doing
both at once is how a real effect reads as a null.

> ### PRIMARY: the mediator. The paired per-founder count of DB-matched web peers, and the Jaccard of the resulting `fieldChannels` sets.

Four reasons, each of which is a reason wsII's and wsIJ's primaries are wrong
here:

1. **It sits one deterministic step from the lever.** `matchCompany` is code.
   No model stands between the search's output and the measurement, so the only
   noise in the primary is the search's own — which §5 measures directly.
2. **It is the quantity the harm hypothesis is stated in.** "A narrower search
   finds fewer DB-matchable peers" is falsified or confirmed by this number and
   by nothing else.
3. **It gates everything downstream, exactly.** If `fieldChannels` is identical
   on both arms for a founder, the whole remaining pipeline is bit-identical
   for that founder and every downstream contrast is exactly zero there. The
   mediator's move rate is therefore a **hard upper bound** on the share of the
   population any end-to-end outcome can differ on. The run measures that bound
   instead of assuming it — which is the thing wsDR's "the early seam admitted
   zero funds" cost us by not doing.
4. **It removes the lever in `poolRecall.ts:189` from the primary entirely.** A
   mediator-only run never calls the selector, so the base-rate sentence never
   renders and a corpus publish cannot touch the primary. It is still pinned in
   §6 for the secondary.

> ### SECONDARY, conditional and declared as such: reciprocal rank of the won fund in the published order, computed **only on the founders whose `fieldChannels` differed**, with that share reported as the denominator.

Reciprocal rank and not EXACT@6, for wsII's reason, which does apply to this
half. And **conditional** because an unconditional mean over 897 of a quantity
that is exactly zero on an unknown majority is a diluted estimate reported as a
population one.

> ### EXACT@6 is not an outcome of this run at any level.

Refused for wsII's reason and a second one: it is a coarsening of a quantity
that is already conditional, so its half-width is the 4.1-point floor divided
by the square root of a share likely well under a half. It may be reported as
descriptive colour. It may not be the headline, and no decision may turn on it.

---

## 5. THE NOISE ARM RUNS FIRST, AND IT IS NOT OPTIONAL

**Nobody has ever measured this stage's self-disagreement.** The web search is
live and the corpus behind it moves hourly. wsII's finding was that the churn
which looked like drift was the model disagreeing with itself, and that the
flip rate was *highest where nothing had changed*. Running treatment against
control here without first running control against control would repeat that
mistake on a stage with a genuinely non-reproducible input.

**Step 0, before any A/B token: control vs control on a subsample, interleaved,
same process, same minute.** Report the paired distribution of the primary
under a null treatment. If control-vs-control moves the matched-peer count as
much as the treatment plausibly could, the arm is unmeasurable at this budget
and the correct answer is to buy nothing — which is what wsII concluded and was
right about.

**Both arms are interleaved per founder in one process.** Not two runs. The web
is different at 14:00 than at 15:00 and a between-run comparison would be
measuring the day.

---

## 6. PINNED — a change to any of these voids the run

| what | value |
|---|---|
| branch commit | `743316a4a68312f1894a5107d52d9322527f93de` |
| `__recallSetDescribed.json` | sha256 `3148e414f886a2b7ca317a47e6bd731936caf845d019addcd00a414fe03fa07e` |
| `poolRecallCurve.generated.json` | sha256 `1c618fe08d99d9c37846c12c5daf02b0ded2e76ac93ae52cf38b1a62f5a993d2` |
| curve provenance | n=821, generatedAt 2026-08-18T21:52:59.072Z, `offerable=760 ids=25c7df59f657ca42 asOf=2026-08-18` |
| population | holdout ∩ described, one founder per company, sorted by name = **897** |
| policy | `IDENTITY=real ANSWERS=strict OWN_HISTORY=withheld CAPITAL=withheld CONSORTIUM=yes` |
| search model | `claude-sonnet-5` |
| search tool | `web_search_20250305`, `max_uses: 4` |
| call shape | `max_tokens: 8000`, `thinking: disabled`, `maxRetries: 1`, 60s timeout, at most one `pause_turn` resume |
| `MAX_COMPETITORS` | 5 |
| `MIN_CHANNELS_CONSIDERED` | 7 |
| arms | `COMPARABLE_CONTEXT=description` (control, the shipped default) vs `=answers` |

**`poolRecall.ts:189` is a lever and it moved between the last two
pre-registrations** (wsII found the curve re-cut twice between wsHO's and
wsHW's, changing what the model was told about its own base rate from 40% to
45% with neither prereg naming it). It is pinned by hash above. **A corpus
publish between this file and the run voids the run**, and that applies to the
secondary; the primary is immune by construction, which is part of why it is
the primary.

---

## 7. COST, AND THE RECOMMENDATION

A mediator-only run is `discoverAndResearch` + `matchCompany`. No writer, no
adviser ranker, no gate hydration — a fraction of an end-to-end brief.

Per call, on `claude-sonnet-5` at the introductory rate in force until
2026-08-31 ($2 / $10 per MTok) plus web search at $10 per 1,000 searches, and
assuming a search-grounded turn pulls tens of thousands of input tokens:
**roughly $0.10–0.20**, dominated by the search results in context, not by the
~150 tokens the treatment adds. Interleaved two-arm coverage of all 897 is
therefore **order $200–400**, and a 200-founder subsample is **order $50–90**.

That is nearing the hundreds, so it is flagged rather than assumed.

> ### THE RECOMMENDATION IS: DO NOT BUY THE FULL ARM YET.
>
> Buy §5's control-vs-control noise arm on a subsample, and the §4 primary on
> the same subsample, and nothing else. That is the cheapest thing that can
> falsify the arm, and §3 says the expensive thing would grade a treatment the
> product does not have — three lines instead of five, one of them constant,
> and its largest varying component inflated by the harness's own descriptions.
>
> **The arm gets its real test the day the harness can answer
> `developmentStage` and `fteBand`, or the day it is measured against founder
> prose rather than project titles.** Until then the honest statement is that
> the treatment was wired, defaulted off, and shown to change the prompt on 897
> of 897 — and that what it changes it *to*, on this population, is not the
> treatment the product would ship.
