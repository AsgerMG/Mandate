# wsDY — the category errors are a slot-filling artefact, and the model says so

Why does the selector offer health-research grants to a consumer bank, farming
grants to a robotics company, and the French national cinema centre to a lending
fintech, when the founder text says plainly what they are?

**Because we ask it for six and only two of the eighteen fit.** It knows this.
It says so, in its own reasoning, on eight of the twelve bench companies, and
then names six because the reply format gives it no way to name fewer.

Everything below is free. No model call was made by this workstream: the
evidence is wsDQ's and wsDS's recorded prompts and replies, read for a question
neither was asked, plus two counters over committed artifacts.

---

## The hypotheses, and what killed each

| # | hypothesis | verdict | what settled it |
|---|---|---|---|
| H1 | **the task rewards filling six slots over leaving one empty** | **SURVIVES** | the model states it verbatim on 8/12; a mechanical count puts the mean number of rows surviving the prompt's own disqualifiers at 2.1 of 18 |
| H2 | reasoning capacity — a model that never justifies a pick reasons worse | **DEAD** | wsDS ran the same twelve at `effort=high` on byte-identical menus. 79,252 thinking tokens. The three named errors resolve; ERC PoC still goes both ways; MEMO@k does not move |
| H3 | the row's `demands:` line drowns its `funds:` line | **DEAD as the cause** | at `high` the model quotes `funds:` lines back accurately and reasons from them. wsDW separately repaired the `funds:` line itself, 51 illegible rows of 133 to 1 |
| H4 | the per-founder verdict line is pure noise | **TRUE BUT NOT CAUSAL** | 17-18 of 18 rows say "nothing we can check rules them out". A constant cannot separate, but it also cannot cause a wrong pick — it can only fail to prevent one |
| H5 | the `mostly X` descriptor actively misleads | **TRUE, SECONDARY** | the CNC row renders as `mostly software & AI` and its `funds:` line is `Aides aux moyens techniques de production et de diffusion, CNC` — nothing says cinema. Real, and it explains Silvr specifically, not bunq or Neura |
| H6 | founder context is weak relative to the rows | **DEAD** | the model paraphrases bunq correctly and unprompted: "they're actually a regulated financial institution", "that's a 5-100x gap" |
| H7 | the 180-char row budget cannot carry the disambiguating fact | **LARGELY DEAD — worth 1 of 9** | `scripts/_wsdy_budget.ts`, below |
| H8 | six distinct INDICES is not six distinct OPTIONS | **TRUE, INDEPENDENT, FIXED HERE** | 4/12 at `low`, and Neura spent 3 of 6 on Innovation Fund SSP/MSP/Battery at `high` |

---

## The survivor, in the model's own words

wsDS's `effort=high` run is the cleanest paired experiment this project has: the
twelve prompts are byte-identical to wsDQ's apart from the per-request fence
nonce, so the only lever between the two runs is the thinking effort. That makes
the reasoning it produced admissible evidence about the prompt, and it was paid
for in a different workstream.

**bunq** — a licensed Dutch consumer neobank, offered health-research grants:

> Given the company's sector focus on software and AI, I'm narrowing down to
> schemes explicitly tagged that way — there are only two.
>
> That said, **I'm constrained to pick 6 from this list of 18, so I need to
> identify which ones are least egregiously mismatched** while still being
> thematically relevant and open to them.
>
> Since the task requires selecting 6 from 18 options **regardless of fit**, I
> need to check the consortium and partnership requirements more carefully.

**Neura Robotics** — cognitive humanoids, offered farming grants:

> ... but that's just three options when **I need six distinct picks. Since the
> requirement is to return exactly six selections regardless of fit quality**,
> I'll have to rank them with the best matches first.
>
> ... then **round out with the best open-band options** even if their budgets
> don't align perfectly, since **I need to fill six slots total**.

**Nortal:** "only one program (option 0) actually lands within the requested
bracket. Every other option falls well below."
**Aleph Alpha:** "Since we're constrained to pick from this candidate list
regardless of the funding mismatch, I need to rank them by other criteria."
**sennder:** "Since I need to pick exactly 6 funds despite these mismatches, I'm
treating the threshold relatively rather than absolutely."
**BioNTech:** "we need to select six options, I'm picking the best matches
despite the funding gap."

Eight of twelve. The failure is not comprehension and not reasoning. It is that
we ask for a fixed six and the eighteen rows do not contain six.

### The same thing, counted, with no model in it

`scripts/_wsdy_slots.ts` scores the eighteen recorded rows of each bench company
against the two disqualifiers **the prompt itself states** — an award median an
order of magnitude off the stated band, and a `mostly X` descriptor naming
another sector — and nothing else. Both are applied generously: a row with no
descriptor counts as on-theme, a row with no median counts as the right size.

```
company             onTheme  rightSize  BOTH   asked for
Neura Robotics          1         3       0      6 of 18
SMART Photonics         5         2       0      6 of 18
Silvr                  12        13       8      6 of 18
bunq                    5         1       0      6 of 18
Photoroom               3        17       2      6 of 18
Aleph Alpha            14         0       0      6 of 18
Nortal                 15         3       2      6 of 18
sennder                 5        15       4      6 of 18
Nebius                  5         0       0      6 of 18
Corti                   9        14       6      6 of 18
BioNTech                6         1       0      6 of 18
eAgronom                5        12       3      6 of 18

mean rows surviving BOTH of the prompt's own disqualifiers: 2.1 of 18
companies with FEWER than the six they must name: 10/12
```

**Mean 2.1, upper bound, against a mandatory six.** Roughly four of every six
published rows are seats the model fills with a row it has itself just
disqualified. The category errors are those seats: they land at rank 6 of 6 for
bunq (Horizon CL1) and rank 3 of 6 for Neura (Horizon CL6), not at rank 1.

---

## What thinking did and did not fix, since it is the closest rival

At `effort=high`, on identical menus, all three of the errors in the question
resolve:

| company | at `low` (EUR 0.017/brief) | at `high` (EUR 0.078/brief) |
|---|---|---|
| bunq | picks `2,4,13,12,3,10` — **Horizon EU CL1**, health research, at rank 6 | picks `2,4,5,12,13,16` — CL1 gone |
| Neura | picks `1,7,4,3,2,11` — **Horizon EU CL6**, farming, at rank 3 | picks `8,6,1,10,9,7` — CL6 gone, but **three Innovation Fund lots** |
| Silvr | picks `1,5,0,2,8,16` — **CNC**, the cinema centre, at rank 4 | picks `16,17,1,0,8,9` — CNC gone |

So reasoning removes the *flagrant* wrong row and replaces it with a *bland* one.
It cannot remove the seat. Neura is the clearest illustration: told to think, it
still had to fill six, and it filled three of them with one programme. wsDS
measured that this buys nothing on MEMO@k, which is exactly what "the marginal
seats got blander, not righter" predicts.

At `low` the model spends **28 output tokens** on bunq — the whole decision is
one forward pass. That is not a defence of `low`; it is why the `low` errors are
flagrant and the `high` errors are boring.

---

## H7, the row budget: worth one row of nine, and only at 600 characters

`scripts/_wsdy_budget.ts` re-renders the nine won rows wsDR graded on, at six
budgets, off the committed snapshot. Free.

- **3 of 9 won funds have no description in the corpus at all** (`eurohpc`,
  `EP EUREKA Eurostars`, `chp`). No budget reaches a page we do not hold.
- **5 of 9 already carry their identifying fact at 180** after wsDW's repair —
  Immersion's `sécurité du transport aérien`, Focused Energy's
  `EFRE-Förderrichtlinie 21+ Hessen`, the two Italian PNRR notices, the German
  applied-energy programme. Raising the budget adds procedure, not identity:
  `successor to closed SA.59366, per EC case register caseLinks`.
- **1 of 9 is the real case.** Salerno's clause reserving the programme to
  `Basilicata, Calabria, Campania, Molise, Puglia, Sardegna e Sicilia` first
  appears at **cap 600**. At 400 the line elides at `dedicata alle regioni
  meno…` — one word short of the region list.

Cost, measured over the 133 described funds on those menus:

```
cap    mean funds: chars/row   +chars on an 18-row menu   ~+input tokens
 180      167                       0                       0
 240      218                     927                     265
 300      265                    1775                     507
 400      329                    2922                     835
 600      408                    4352                    1243
 900      460                    5276                    1508
```

1,243 extra input tokens is about +13% on a 9,485-token prompt, for one won row
in nine. **Not the disease.** If it is taken, 600 is the number, because 400 is
where Salerno breaks and 240/300 buy procedure. The larger residual on those nine
is that a third of the won funds have no description at all, which is corpus
coverage and not a budget.

---

## What shipped on this branch

**1. Six distinct PROGRAMMES, not six distinct index numbers.** The ask said
`Exactly 6 DISTINCT index numbers`, which two leaves of one scheme satisfy
perfectly, while SELECT-8 in the contract beside it said the opposite. The prompt
now states the founder's own test — *would a company turned down by one of these
be turned down by the other?* — and the reply line asks for different programmes.

This is stated and not computed, deliberately. A `channel`-keyed group block was
written, run against all twelve pools, and thrown away: `channel` puts all
eighteen of Aleph Alpha's rows in one bucket, and it puts **Horizon EU CL1 and
CL4** in one bucket, which are two real options with two real calls. Suppressing
one of those is the wsCG2 defect — collapsing doors of one scheme recovers
nothing and costs real routes. No title-prefix rule separates "Innovation Fund
SSP / MSP / Battery" from "Horizon EU CL1 / CL3 / CL4" either. So the model
applies the test, and the tally counts the **same-title** case only, named as the
strict floor it is.

**2. `AGENT_SELECT_COUNT_MODE=atMost`, off by default, ready to run.** Under it
`SELECT_COUNT` becomes a ceiling and the prompt says what happens to a seat the
model declines:

> You have 6 places and you do not have to fill them. Name only the schemes you
> would actually tell this founder to apply to. A place you do not use is not
> wasted and is not left empty: it keeps the empirical ranker's own choice, which
> is what ships without you. So naming a scheme you have just judged wrong is
> strictly worse than naming fewer.

That sentence is load-bearing. `agentSelectRows` already fills behind the picks —
chosen rows move to the front and every other row keeps its shipped relative
position — so declining does not empty a seat, it returns it to the arithmetic
ranker. The arm becomes additive in the sense `assist` already is: it can add a
case it is sure of without spending a seat on one it is not. A model not told
this will assume the founder simply sees less, and will fill.

The JSON template is `{"picks":[0]}` rather than six zeros under this mode. Six
zeros ARE a request for six however the sentence above them is worded.

SELECT-1 is amended to state both regimes and stays hard and enforced;
`checkSelection` takes the mode.

---

## The one comparison to buy, designed and costed

**The account is at zero credit, so this was not run.** It is one lever against a
control that already exists on disk.

```
# requires wsDS merged (thinking.display, scaled max_tokens, the truncation counter)
WSDQ_OUT=count_mode_wsDY \
AGENT_SELECT=adviser \
AGENT_SELECT_EFFORT=high \
AGENT_SELECT_COUNT_MODE=atMost \
  npx tsx scripts/_wsdq_seam.ts
```

* **control**: `project-mgmt/findings/dark_levers_wsDS/bench_high/` — twelve
  companies, `effort=high`, `max_tokens=12288`, EUR 0.9314, already paid for.
* **lever**: exactly-six becomes at-most-six. Nothing else moves. The menus are
  built by the same code from the same corpus and must be verified identical
  before any difference is attributed.
* **cost**: input grows by the licence, about 110 tokens on a 9,485-token
  prompt; output can only shrink. **EUR 0.94 expected, budget EUR 1.10.**
* **attestation**: the run must print `ranker: all 12 request(s) on EMBEDDING`
  and `agent-select: arm=adviser depth=40 count=<=6 effort=high ... DECLINED n
  seat(s) on m brief(s)`, or it is not evidence.

**Predictions, stated before the spend:**

* If H1 is right — on **8 or more of 12** the model names fewer than six; mean
  picks between 2 and 4; **no row it has itself disqualified appears at all**;
  and the rows it does name are a subset of what it named under `exactly`.
* If H1 is wrong — it names six on 10 or more of 12 even when licensed to name
  fewer. That kills H1 outright and sends the question back to the menu.

MEMO@k is **not** the metric for this run and should not be quoted from it.
Declining seats returns them to the shipped ranker, so on the founders where the
model declines, the arm converges toward the control by construction. What this
run measures is whether the wrong rows stop being published. If it works, the
metric to run afterwards is MEMO@k on the recall set at N large enough to
separate the two, which is a different and more expensive run.

---

## The finding underneath the finding

Mean 2.1 usable rows in an eighteen-row pool is not a selector problem. The
selector cannot pick what it was not shown, and wsDR already established that
showing it more does not help. The model said it plainly on Neura:

> the real fit might be **something outside this list entirely**

Letting it name fewer stops us publishing rows we have already disqualified. It
does not put the right fund on the page. That is gate 1's composition, and it is
the standing strategy's own territory — the code selects the subset, the model
ranks it. On these twelve the subset is the binding constraint, and it now has a
number: **2.1 of 18.**
