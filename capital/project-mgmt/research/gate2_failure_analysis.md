# Why gate 2 picks the wrong funds

Diagnostic run 2026-08-06. Model `claude-haiku-4-5`, fixture `gate1_holdout.json`
@ `gate1@32f28f2`, n=40 strided (the same stride `measure_pipeline.ts` uses), of
which 20 carry the full ablation set. Harness: `website/frontend/scripts/diag_gate2.ts`.
Raw per-case output including every question, answer, pick and raw model reply is
regenerable from that script.

**The finding in one line: gate 2 does not select badly — it selects at chance,
and because chance is worse than gate 1's empirical prior, every slot it
overwrites destroys value. Nothing added to gate 2 fixes this; only taking
permission away does.**

---

## 0. Two defects to fix before anything else

These are bugs, not design problems, and both are in `measure_pipeline.ts` today.

### 0.1 The pick parser reads digits out of the model's prose

```ts
const picks = (text(s).match(/\d+/g) ?? []).slice(0, 5)
```

It takes the first five integers **anywhere** in the reply. **37 of 40 replies
begin with a prose preamble** ("Looking at this company's profile: - Spanish
software/AI startup..."), and the model happily writes numbers in it.

| | n=40 |
|---|---:|
| replies with a prose preamble before the answer line | 37 (93%) |
| naive parse differs from the model's actual answer line | 14 (35%) |
| **runs that return fewer than 5 distinct funds** | **16 (40%)** |
| exact-in-5, naive parse | 14/40 (35%) |
| exact-in-5, parsing the answer line | 15/40 (37.5%) |

Observed in category A: OHB System AG's "five" parsed to `[3,4,50,4]` — four
funds, one of them twice. RATIER-FIGEAC's to `[2,5,1,1,4]`.

Cost: **−2.5pp exact**, and 40% of production runs would ship a shortlist of
three or four funds. The exact metric badly understates this one.

### 0.2 The question list is contaminated by markdown headers

```ts
const questions = text(q).split("\n").map(x => x.trim()).filter(x => x.length > 12).slice(0, 8);
```

The writer usually opens with a heading. `"# 6 Questions to Differentiate These
Funding Schemes"` is 45 characters, so it survives the filter and becomes
question 1 — which also pushes the real eighth question off the `slice(0, 8)`.
The founder-simulator then answers the *real* questions, and the selection prompt
zips the two lists positionally.

| | n=40 |
|---|---:|
| `questions[0]` is a markdown header, not a question | 23 (58%) |
| `answers[0]` is a markdown header | 9 (23%) |
| **cases where a majority of Q/A pairs are mis-numbered** | **14 (35%)** |
| cases with fewer answers than questions (rest filled `"not sure"`) | 16 |

What the selector actually reads, verbatim, on Arsys:

```
Q: Is your company established in Spain, or in another EU/EEA country?
A: Startup/SME
Q: Are you a startup/SME, or a large enterprise?
A: Not sure - depends on the specific project
```

and on UNIVERSITA CAMPUS BIO MEDICO:

```
Q: Is your company established in Italy, and if so, which region
   (Lombardy, Tuscany, Friuli-Venezia Giulia, Piedmont, Puglia, or another)?
A: 2. Single SME/startup.
```

### 0.3 (documentation drift) the menu shows the administering body, not the profile

`fund_selection_state.md` says gate 2 "now reads `instrument_profiles`". It does
not. `build_gate1_fixture.ts` writes both `body: administeringBody` and
`profile: instrument_profiles.profile_text`, and `measure_pipeline.ts` renders
`s.body`. The row the model sees is the **name of the granting authority**
("Bundesministerium für Bildung und Forschung"), not what the scheme funds.
Ablation (d) below fixes this and it is worth **zero**, so this is a
documentation correction rather than a defect — but the doc should stop claiming
it.

---

## 1. Failure taxonomy

n=40. Gate 1's own top-5 is deterministic: **20/40 (50%) exact, 38/40 (95%)
regime**. Gate 2 this run: **14/40 (35%) exact, 32/40 (80%) regime**.

| category | n | share |
|---|---:|---:|
| **A — gate 1 had it in its five, gate 2 threw it out** | **9** | 23% |
| B — both missed | 17 | 43% |
| C — gate 2 rescued one gate 1 missed | 3 | 8% |
| D — both had it | 11 | 28% |

Net: **−9 +3 = −6 cases = −15pp**.

> **Run-to-run variance.** The logged 2026-08-05 run of the identical prompt on
> the identical 40 cases scored 10/40, not 14/40, with zero failed calls. Gate 2
> is stochastic at roughly ±7pp (1 SE) at n=40; gate 1 is deterministic. Any
> single gate-2 number should be read as 25–35%, and it is below gate 1's 50%
> either way.

### Category B is not gate 2's fault

Of the 17 both-missed cases: **0 have any company description**, and the position
of the right fund in gate 1's 58-fund order is

| want at index | 5–9 | 10–19 | 20–39 | 40+ | not in subset |
|---|---:|---:|---:|---:|---:|
| cases | 4 | 1 | 2 | 8 | 2 |

**Twelve of seventeen are at index 20 or worse, or absent.** No five-fund
selector reaches them. Category B is a gate-1 ranking and corpus problem.

### Category A: what gate 2 substituted

There is no single villain. Across the nine cases, 25 output slots were filled
from outside gate 1's top-5:

| what replaced the right fund | slots |
|---|---:|
| a **national/regional sibling** of the right fund — same country, same channel, often the same legal title with a different granting body (CDTI ×3, `Régime cadre exempté` ×4, Bavarian/Hessen/Saxon Land programmes, `Decreto MUR-MISE`, …) | 15 |
| an **EU-level flagship** (EIC Accelerator ×3, EIC Transition, EIC Pathfinder, ERC POC, Horizon EU CL5 / CL6 / Missions / EIE) | 10 |

So "it prefers the famous EU programme" is **only half true**. Measured across
all 40 cases:

| | EU-level share |
|---|---:|
| of the menu | 28% |
| of gate 1's top-5 | 14% |
| **of gate 2's picks** | **19%** |
| of the ground truth | 18% |

Gate 2 over-weights EU-level relative to gate 1 (+5pp) but lands roughly on the
true base rate. The stronger and more reliable signal is **genericness**:

| mean ubiquity (in how many of the 80 candidate subsets the fund appears) | |
|---|---:|
| the fund actually won | 17.4 |
| gate 1's top-5 | 17.9 |
| **gate 2's picks** | **24.9** |

Gate 2 drifts +40% toward funds that are on everyone's menu. Thirteen EU
instruments (all 6 Horizon Pillar II clusters, 3 EIC, EIT, ERC POC, CBE) appear
in **80/80** subsets and together are the right answer **5 times in 80**.

### The mechanism, in one calculation

Gate 2 replaced **98 of 200** output slots (49%) with funds from outside gate 1's
top-5.

| | hit value per slot |
|---|---:|
| a gate-1 top-5 slot | 20/200 = **10.0%** |
| a slot gate 2 promoted | 4/98 = **4.1%** |
| a random outside-top-5 slot | 0.88% |

Gate 2's promotions are 4.6× better than random — its reading of the text is
**not noise**. But they are 2.4× *worse* than what they displace. Expected loss
= 98 × (10.0% − 4.1%) = **5.8 hits = −14.4pp**. Observed: −5 hits, −12.5pp.
The arithmetic accounts for essentially the entire deficit.

### And its keep/drop decision is a coin flip

Of gate 1's five, which does gate 2 keep?

| | kept |
|---|---:|
| the fund that actually won | 11/20 (55%) |
| a fund that did not win | 75/180 (42%) |

A 13pp edge on n=20 — not distinguishable from chance. **Gate 2 cannot tell
which of gate 1's five is the right one.** That is the whole failure.

---

## 2. The questions

7.9 asked per case, 315 total, 296 distinct after normalisation — so they are
freshly written each time, not a template. What they ask about:

| theme | share of questions |
|---|---:|
| where are you established / which country | 29% |
| what sector are you in | 21% |
| consortium or single entity | 15% |
| SME or large | 13% |
| environment / decarbonisation | 13% |
| budget | 11% |
| grant vs loan vs equity | 7% |
| universal state-aid exclusions | 7% |
| TRL / maturity | 2% |

**46% of questions are dead on arrival** — either they re-ask a fact the system
already has (country and sector are inputs to gate 1) or they interrogate a
boilerplate exclusion. Only **3.7 of 7.9** questions per case can discriminate.

The boilerplate is structural, not the writer's fault. Half the menu carries the
same clause: `"Tobacco, gambling and betting, and weapons and munitions are
outside the scope"` appears on **2,316 of 4,626** rendered candidates, and
`"Aid is not available to an undertaking in difficulty"` on the same 2,316.
**66% of candidate rows share their entire `requires:` block byte-for-byte with a
sibling.** A question about them cannot separate anything.

**The worst questions** (asked repeatedly, answered identically by every scheme
on the menu):

> `# 6 Questions to Differentiate These Funding Schemes` — a heading, counted as question 1
> `Are you operating in tobacco, gambling/betting, weapons/munitions, or high-risk mobile network equipment sectors?`
> `Was your company in financial difficulty on 31 December 2019, or did it become so between 1 January 2020 and 30 June 2021?`
> `Does your company have Chinese ownership or involvement, or is it subject to high-risk telecom equipment restrictions?`
> `Is your company established in Germany, another EU/Associated Country, or outside the EU?` — the country is already an input

**The best question in the corpus**, and the one that would actually work:

> `Where is your company registered/established, and in which French region (if applicable)?`
> `Is your innovation focused on a specific regional cluster or priority area (e.g., 6G, sustainable mobility, circular economy, green hydrogen)?`
> `Is your project focused on research & development/innovation, or on capital investment/digitalization of existing operations?`

Sub-national region is *the* discriminator: the ground truth is repeatedly a
`Conseil régional` or a Bavarian/Hessen Land scheme, and its siblings differ by
nothing else. **It is asked in 6% of questions, and 13 of those 18 times the
founder answers "not sure".** (`fund_selection_state.md` already records that no
leak-free ground-truth founder region exists — this is the same wall.)

---

## 3. The answers

| | |
|---|---:|
| answer lines produced | 299 |
| hedged / "not sure" / "unclear" / "depends" | **140 (47%)** |
| hedge rate on the 7 cases **with** a description | 18% |
| hedge rate on the 33 cases **without** one | **53%** |

**66 of the 80 fixture cases have an empty `description`.** On those, the
simulator is given only country and sector and says so out loud:

> `4. Not sure - my company description is empty, so I cannot specify the project type.`

So on 83% of cases the "founder interview" is two model calls that return the
country and the sector — both of which gate 1 already used.

**But information is not the bottleneck**, and this is the counter-intuitive
result:

| | n | gate 1 top-5 | gate 2 |
|---|---:|---:|---:|
| cases **with** a description | 7 | **7/7 (100%)** | **2/7 (29%)** |
| cases with **no** description | 33 | 13/33 (39%) | 13/33 (39%) |

Where the founder said nothing, gate 2 is a wash. **Every net loss gate 2
inflicts is on the cases where the founder said something.** Giving the model
material to reason from is what makes it overwrite the prior.

---

## 4. Position bias

Distribution of gate 2's picks over the position in the list it was shown
(58-fund menus, so a uniform picker averages index ~28):

| shown index | 0–4 | 5–9 | 10–19 | 20–39 | 40+ | mean index |
|---|---:|---:|---:|---:|---:|---:|
| **(a) list in gate 1's order** | **55%** | 17% | 12% | 10% | 5% | **9.2** |
| **(c) list SHUFFLED, order claim removed** | **36%** | 7% | 18% | 26% | 13% | **18.4** |
| uniform | 8.6% | 8.6% | 17% | 34% | 31% | 28.1 |

Read the shuffled row: with the ordering destroyed and the "already ordered"
claim deleted, the first five *random* rows still absorb **36% of picks against
an 8.6% expectation — 4.2× over-selection with zero content justification.**
Position anchoring is real and roughly half the head-concentration.

But it does not cost accuracy. Under shuffle, the picks' position in gate 1's
*true* order goes flat (19% / 20% / 16% / 20% / 23% across the same buckets) —
correlation with the empirical prior is gone — **and exact accuracy is
unchanged** (6/20 either way). Anchoring changes *which* wrong funds are chosen,
not how often they are wrong.

---

## 5. Ablations

Same 20 cases throughout, exact-in-5, scored with the corrected parser so the
comparison isn't contaminated by §0.1. Gate 1's own five on these 20: **9/20
(45%) exact, 19/20 (95%) regime.**

| variant | exact | regime | keeps gate 1's five |
|---|---:|---:|---:|
| **(a) current 3-step, as shipped** | 5/20 (25%) | 14/20 (70%) | 44% |
| (a) current, corrected parser | 6/20 (30%) | 14/20 (70%) | 44% |
| **(b) no questions at all** — candidates + description only | 6/20 (30%) | 15/20 (75%) | 53% |
| **(c0) same order, "ordered" claim removed** | 5/20 (25%) | 16/20 (80%) | 37% |
| **(c) list SHUFFLED, "ordered" claim removed** | 6/20 (30%) | 19/20 (95%) | 24% |
| **(d) full `instrument_profiles` text instead of the body name** | 6/20 (30%) | 16/20 (80%) | 53% |
| **(e) demote-only** — may drop a top-5 fund only on an explicit disqualification | **8/20 (40%)** | 18/20 (90%) | **70%** |
| *gate 1's deterministic five* | *9/20 (45%)* | *19/20 (95%)* | *100%* |

Four of the five ablations move exact accuracy by **zero**:

- **Deleting the entire question/answer stage costs nothing** (b = a = 30%).
  Two of gate 2's three model calls per case buy 0pp.
- **Quadrupling the eligibility text costs nothing** (d = a = 30%), despite
  tripling the prompt from 14.6k to 45.1k characters.
- **Destroying gate 1's ranking entirely costs nothing** (c = a = 30%). The
  model is told the order is "empirical and strong"; removing all of that
  information does not change its hit rate. It is not using the prior.
- Removing the ordering claim while keeping the order (c0) is if anything
  slightly worse.

Only **(e) demote-only** moves: **+10pp exact, +20pp regime**, and it is the
only variant that meaningfully raises retention of gate 1's five (70% vs 44%).
Retention and accuracy move together across all six variants — accuracy is a
near-linear function of how much of gate 1's order survives. Extrapolated to
100% retention it converges on gate 1's own 45%.

**No configuration of gate 2 tested beats gate 1's deterministic five.**

---

## 6. Verdict — causes ranked by measured cost

Total deficit to explain: gate 2 **35%** vs gate 1 **50%** exact = **−15pp**
(−6 cases in 40); regime 80% vs 95% = **−15pp**.

| # | cause | measured cost | evidence |
|---|---|---:|---|
| **1** | **Gate 2 is permitted to re-rank at all.** It replaces 49% of the output with slots worth 4.1% each, displacing slots worth 10.0%. Its keep/drop decision on gate 1's five (55% vs 42%) is a coin flip. | **−14.4pp** predicted, **−12.5pp** observed — i.e. the whole deficit | §1; ablation (e) recovers +10pp of it by removing permission, and the residual tracks the re-ranking freedom it still has |
| **2** | **Output parsing reads digits out of prose.** | **−2.5pp exact**, and **40% of runs return fewer than 5 funds** — a shipped correctness bug the accuracy metric understates | §0.1 |
| **3** | **The question/answer stage is inert.** 46% of questions redundant or boilerplate; 47% of answers hedged; 58% of runs lose a question slot to a markdown header; 35% pair every answer with the wrong question. | **0pp** — removing it entirely (b) changes nothing. Costs 2 of 3 model calls per case and buys nothing. | §2, §3, ablation (b), §0.2 |
| **4** | **Position anchoring.** 4.2× over-selection of the first five rows of a *randomly ordered* list. | **0pp on exact.** Changes which wrong funds are picked, not the hit rate. | §4, ablation (c) |
| **5** | **Missing information.** 83% of cases have no description; the discriminating question (sub-national region) is unanswerable. | **0pp for gate 2** — more text (d) buys nothing, and gate 2's damage is *concentrated on the 7 cases that DO have a description* (7/7 → 2/7). It is the binding constraint on **gate 1**: 9 of 17 both-missed cases have the right fund at index 20+ or absent. | §3, §1, ablation (d) |

### What this means

The framing "the LLM picks the wrong funds" is wrong. The LLM picks *plausible*
funds — 4.6× better than random — from a menu where 66% of rows share identical
requirement text, 55% are untranslated national legal titles, and (in France)
25 of ~58 rows are near-clones of `"Régime cadre exempté de notification..."`
distinguished only by the name of the granting authority. **On that menu,
plausible is not good enough, and the empirical prior gate 1 computed from
627,957 award pairs is strictly better information than anything readable in the
text.** Every slot the LLM takes back from the prior is a losing trade.

There is no prompt that fixes this, because the ablations show the prompt is not
where the information is. Three conclusions, in order of confidence:

1. **Ship gate 1's five.** It is deterministic, 50% exact / 95% regime, and no
   gate-2 variant tested reaches it.
2. **If gate 2 must stay in the path, it may only demote.** Even the strict
   demote-only prompt (e) still leaks — it keeps only 70% of gate 1's five when
   told to keep all of them unless explicitly disqualified. The constraint should
   be enforced in code, not asked for in a prompt: score the answers against each
   candidate's *stated* requirements, drop only on a hard fail, and refill from
   gate 1's order. That is deterministic and cannot fall below gate 1.
3. **The remaining headroom is gate 1's, not gate 2's.** 9 of 17 both-missed
   cases have the right fund at index 20+. That is a ranking problem on a corpus
   where the discriminating fact (sub-national region) is not in the intake.
   This is the same wall `fund_selection_state.md` already records as settled;
   nothing here reopens it.

Fix §0.1 and §0.2 regardless — they are cheap, and until they are fixed every
gate-2 number in the history file is measured through a parser that returns
three or four funds 40% of the time.

---

# The rebuild, and what it measured (2026-08-06)

Everything §6 recommends against was built anyway, deliberately, because the
diagnosis "it is choosing blind" implied that showing it the discriminating
fields would fix it. It does not. Recording that here so the next attempt does
not spend the same week.

All numbers: `N=40 G2=<variant> npx tsx scripts/measure_pipeline.ts`,
`claude-haiku-4-5`, fixture `gate1_holdout.json` @ `gate1@32f28f2`, the same
strided 40 cases throughout, both gates in the same run.

| variant | exact | regime | short shortlists | malformed replies |
|---|---:|---:|---:|---:|
| *gate 1's own deterministic five* | *20/40 (50%)* | *38/40 (95%)* | — | — |
| `legacy` — as shipped | 14/40 (35%) | 37/40 | ~40% (unmeasurable through the old parser) | — |
| `parser` — JSON output, id-paired Q/A, nothing else | 13/40 (33%) | 31/40 | **0** | **0** |
| `axes` — pinning fields, family-grouped menu, axis-driven questions | 12/40 (30%) | 35/40 | **0** | **0** |
| `swap` — same, answer confined to gate 1's families and slot counts | 15/40 (38%) | 38/40 | 2 | 7 |
| **`veto` — gate 1's order stands, model may only strike out, enforced in code** | **20/40 (50%)** | **38/40 (95%)** | **0** | **0** |

## What was built

`lib/intelligence/shortlistAxes.ts` computes, per shortlist and before any
prompt: the axes the candidates actually split on, scored by coverage x how
much of the list a perfect answer removes; and `familySectorShare`, the
P(fund | sector) posterior scoped inside each programme family.
`lib/intelligence/fundSelection.ts` is gate 2 itself — four selection shapes,
all JSON in and out. `build_gate1_fixture.ts` now carries `award_p25/p50/p75`,
`award_n`, `capital_type`, `sector_mix`, `event_count`, `company_count`,
`last_year` and per-field gate demands on every candidate row.

## The four results worth keeping

**1. The information hypothesis is wrong.** Giving the model `award_p50` with
its n, capital type, delivery body, liveness, the within-family sector share
and a menu where siblings sit adjacent measured **12/40 — below the 14/40 it
managed knowing none of it.** More to read does not make it choose better.

**2. No deterministic use of the sector posterior beats gate 1 either.**
Swapping gate 1's pick for a sibling whenever that sibling holds >=20/30/40/50%
of the family's sector awards and >=2/3/5x the chosen fund's share: every one
of the sixteen threshold combinations scored 19 or 20 of 40. Gate 1 already
reads `sector_mix`. The +26pp within-sibling-group result in
`corpus_signal_map.md` is real and is already spent.

**3. The family is not the problem; the leaf is, and nothing available fixes
it.** Gate 1 puts the right FAMILY in its top five in 38 of the 38 cases where
the fund is reachable at all (95%) and the right LEAF in 20 (50%); in 18 cases
it surfaces a sibling of the won fund instead of the won fund. Confining gate 2
to exactly those families and slot counts therefore costs nothing and hands it
only the leaf choice — and it still scored 15/40. Regime accuracy returns to
38/40 under that constraint, which is the constraint working; the leaf does not
follow.

**4. Only removing the choice reaches gate 1.** `veto` ties it exactly, 20/40
and 38/40, with zero short shortlists and zero malformed replies. It issued
real vetoes on 16 of the 40 cases and rescued zero while breaking zero — net
neutral. On a fixture where 33 of 40 companies carry no description and the
founder simulator answers "not sure", there is nothing for a veto to bite on,
so this measures **the floor holding, not the mechanism working**. Its upside
is untested, not disproven.

## The two bugs are fixed and that part is unambiguous

Every reply is JSON, parsed with a fenced/prefaced/unbalanced-brace-tolerant
extractor and one retry; every answer carries the id of the question it
answers, so a dropped line cannot shift the pairing. Across the three
rebuilt-path runs above: **0 shortlists shorter than five, 0 malformed
replies.** The old parser shipped three or four funds in 40% of runs.

## What this leaves

The headroom on this sample is real — duplicate-query collisions cap it at
38/40, not at the ~64% feared — so the test set is not the wall. The wall is
that the fields which separate leaves are the ones the intake does not collect:
sub-national region (+13.9pp, asked in 6% of questions and answered "not sure"
13 times in 18), sub-sector (+18.5pp, no `subsector_mix` column exists), GBER
objective (+18.2pp on 17.5% coverage). And on the 20 cases gate 1 misses, the
won fund sits at rank 40+ or is absent in ten of them — beyond any selector.

So the ranked next moves are unchanged and they are all upstream of gate 2:
give the founder somewhere to describe what they build (change E — embedding
retrieval alone reaches 79.4% top-5 with a real description against 17.2% with
the canned template), collect region, and build `subsector_mix`. Gate 2 should
stay in `veto` until one of those lands.
