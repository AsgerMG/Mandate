# wsHG — the field DOES separate the doors. Reading it off award prose does not.

**FOR THE OWNER, VERBATIM.** **The 86 pairs are separable on this field: an
answer holding the truth picks the won door on 64 of 86, net +63 against the
constant's +5.** That is the strongest evidence yet that `useOfFunds` is worth
having, and it is a fact about the *field*, which a founder is asked on the
first page and states about themselves. **What this workstream closes is one
derivation of it, not the field.** Reading the answer off each founder's
description prose works — 642 of 897, 71.6%, for $1.07 — and produces a
genuinely different answer from the harness's constant for half the population,
so it is not a lucky guess reproducing the pin. But it picks the won door 12
times and the wrong door 10 (**net +2 against the constant's +5**; net −2 on the
pairs whose answer actually changed), and in the funnel it is **inert**: −1
founder at six rows, 38.7% → 38.6%, McNemar p = 1.000, and the 59 hard filter
gates that turn on this field fire **zero** times. **These descriptions are
written out of award records; a real founder is asked and states it. So 71.6%
bounds today's harness, not the product** — the standing rule that a ceiling
measured on today's intake bounds today's questions and not the target, and this
run is a clean instance of it. Three things to carry forward. **One: the option
table is the finding underneath the finding.** `feasibility_study` alone is
worth **+25** and `production_capex` misleads **26:5** — and the classifier names
`production_capex` for 120 founders *because it is reading them correctly*. One
option carries most of the signal, another carries anti-signal, and whoever next
touches the first-page question needs that table more than any aggregate. **Two:
the scorer throws away signal it is handed** — on 28 of the 64 separable pairs
the derived answer *contained* a separating option and scored both doors anyway,
because `objectiveScorer` matches on overlap, so a richer answer separates less.
**Three: I priced a rescoring fix at pin +5 → +14 and then killed it** — it wins
by preferring the door with the *longer* registered purpose list (43 of 54),
which is `leaf_separation_wsAO` §4's documentation-volume prior in a new place,
and the control that removes the volume advantage is worth exactly nothing. **Do
not quote the +14.** `shortlist.ts` was not touched. What this says firmly:
**stop deriving this field from prose — but do not conclude the field is dead,
because on the population where the doors differ it is worth +63 to know the
truth.**

---

```
run                 2026-08-17, isolated worktree wsHG-useoffunds
population          897 founder(s) — held out, described, one per company
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL to one_funnel/latest.md and to
                    door_separation_wsHA. The same founders, so §4 is comparable
                    with wsHA §6 to the founder rather than to the rounding.
derivation          one claude-haiku-4-5 call per founder, structured output,
                    max_tokens 200, no thinking. Input: r.description ONLY.
cost                $1.068 total — $0.983 the full run (817 founders), $0.061 a
                    run the leak guard aborted at founder ~54 (which is why the
                    check is now a PRE-FLIGHT over the whole population, at zero
                    spend), $0.024 a 20-founder smoke. 887 classified in all.
                    NO ranker run, NO memo run, nothing re-bought. Cached by
                    description hash, so re-running the derivation is FREE.
pre-registered      PREREGISTRATION.md, committed 21:31:57, eight minutes before
                    the first paid token (git log is the record, not this line)
reproduce           OUT=/tmp/wshg_uof.json npx tsx scripts/_wshg_useoffunds.ts
                    UOF=/tmp/wshg_uof.json npx tsx scripts/_wshg_doors.ts   (free)
                    USE_OF_FUNDS=/tmp/wshg_uof.json npm run stages          (free, ~2h40m)
```

**Read-only on the product.** `shortlist.ts`, `objectiveScorer`, `OBJECTIVE_MATCH`,
`memoCandidates.ts` and `caps.ts` are untouched. `founderIntake` still pins the
field. The only shipped-adjacent change is a new default-off arm in
`measure_funnel.ts`, which writes nothing.

## 1. What was asked, and what was in the way

`door_separation_wsHA/README.md` §6 found the largest identified separator on
the 287 sibling-miss pairs and could not price it:

```
both doors declare a registered purpose            96   33.4%
  ...their USE OF FUNDS differ                     86   30.0%   <- the founder is asked this on page one
neither door declares one                         176   61.3%
```

The signal is already wired into the product. `objectiveScorer` (shortlist.ts)
multiplies `OBJECTIVE_MATCH = 1.35` into the score inside the within-regime
sibling reassignment — exactly the population wsHA studied. Nothing needed
building.

The blocker was the harness, and it was a real leak constraint.
`founderIntake` pins `useOfFunds` to `["industrial_research",
"experimental_development"]` for all 897 founders and says why: the only
derivation available read the register's `objectives_text`, a statement about
the SCHEME, and `objectiveScorer` ranks on that same field. Deriving it that
way would let the signal grade itself.

**So this workstream derived it from somewhere else: the founder's own
description prose, and nothing else.**

## 2. The leak position, which is the whole game

One `claude-haiku-4-5` call per founder. The model saw `r.description` and
nothing else — not the won fund, not its id, its name, its scheme, its sector
label, not the answer key.

**Constructed, not asserted after the fact.** The request is built from a
single-key object (`promptFor({ description })`), so there is no second field
to forget when somebody adds one to `RecallRow`. A **pre-flight** then searches
every assembled prompt for the row's own `instrument`, `instrumentName`,
`descriptionFrom` and `reattributedFrom` — over the whole population, **before
the first paid token**, because a leak check that fires at founder 54 has
already spent money on 53 and the operator then has an incentive to widen it.

**Why a field derived this way cannot leak, stated so it can be checked.** The
derived value is a pure function of `r.description`, and `r.description` is
already handed to the ranker on every arm of this harness — `semanticFundMatch`
embeds it, `buildInstrumentTableHydrated` and `orderMemoCandidates` receive it.
A post-processing of an input the ranker already reads cannot carry more
information about the answer than that input already carries.
`check_answer_not_reachable.ts` is green, including `PROVE=1`, and it is green
by construction rather than by exemption: it reasons about `lib/`, and these are
harness scripts not reachable from `pipeline.ts`.

### The guard fired twice, and neither hit was argued past

```
leak pre-flight: 897 prompt(s) checked
  887 carry none and are classified; 10 (1.1%) are WITHHELD and keep the pin:
      6  descriptionFrom=eic_accelerator
      2  instrumentName=Demonstrator
      1  descriptionFrom=clean_aviation
      1  descriptionFrom=eic_transition
```

- **`Demonstrator`** is a fund whose display name is one ordinary English noun,
  appearing in two founders' prose about their own work. Almost certainly
  harmless — one common word cannot single out one of 1,088 instruments.
- **`descriptionFrom`** names the regime a rebuilt description was recovered
  from. Usually a *different* regime than the won fund, which is the whole point
  of the rebuild. **Measured rather than assumed: on 31 of the 430 rows that
  carry one, `descriptionFrom` IS the won fund's own ancestor** (`innovate_uk`
  under `innovate_uk__grant_for_r_d_...`). That is precisely the sibling
  relaxation `recallSet.ts` names as the leak.

The first draft of the guard tried to decide which hits were *really* leaks.
That means writing a rule whose job is to let a leak candidate through, and a
workstream that argues its way past its own guard has no guard. **The guard has
no exemption clause: all 10 are withheld from classification and keep the pin.**
It costs 1.1% of coverage and buys a position that needs no argument. Coverage
below is reported over all 897, never over the classified 887 — a coverage
figure must not be flattered by the founders its own guard removed.

## 3. Can a founder's own prose yield the field — YES, on 71.6%

```
COVERAGE, over all 897 founders
  a non-empty answer       642/897  71.6%
    stated                 190       21.2%    the text says what the work or money is for
    inferred               452       50.4%    the text describes the work closely enough
    cannot_tell            245       27.3%    the text says nothing about it
    withheld (leak guard)   10        1.1%
```

**Pre-registered outcome 1: PAYS** (the bar was ≥ 50%).

The classifier was written to make `cannot_tell` easy to choose — "prefer
`cannot_tell` over a guess; choosing a category you are not reading out of the
text makes the answer worse than no answer" — so 71.6% is a floor, not a
stretch. The 27.3% that says nothing is the real shape of this population's
prose: company names, consortium member lists, Polish register dumps
(`Authority: ... | Sector: ... | Form: ...`), and bare titles like
`Workinggrup Standard and IoT-platforms 2021`.

What the money is for, across the 642 answered:

| | n | share of 897 |
|---|--:|--:|
| `experimental_development` | 528 | 58.9% |
| `industrial_research` | 236 | 26.3% |
| `production_capex` | 120 | 13.4% |
| `rd_facilities` | 68 | 7.6% |
| `feasibility_study` | 59 | 6.6% |
| `market_launch` | 50 | 5.6% |
| `ip_protection` | 11 | 1.2% |
| `working_capital` | 7 | 0.8% |

```
  identical to the PIN     196/897  21.9%   <- the funnel arms' own control
  differs from the PIN     446/897  49.7%
```

**Half the population gets a genuinely different answer.** The pin is not a
lucky guess that the derivation merely reproduces.

## 4. Does it pick the won door — NO. It does not beat the constant.

Free and offline, on wsHA's own 287-pair evidence file joined to
`__objectives.json`. The 96/86 split re-derives exactly, and the script refuses
to report if it does not.

`objectiveScorer` awards `OBJECTIVE_MATCH` to a leaf whose registered
`useOfFunds` **overlaps** the founder's answer — overlap, not equality, which is
coarser than it looks and is why the pin already scores both doors of most pairs
the same.

```
WHICH DOOR DOES `objectiveScorer` PREFER, over the 86 pairs

  PIN (what ships today)         won  13  15.1%   shown   8   9.3%   both  65   neither   0   NET +5
  DERIVED (founder's own words)  won  12  14.0%   shown  10  11.6%   both  61   neither   3   NET +2
  ORACLE (best possible)         won  64  74.4%   shown   1   1.2%   both  21   neither   0   NET +63

RESTRICTED to the 58 pairs whose answer ACTUALLY CHANGED

  PIN                            won   9  15.5%   shown   8  13.8%   both  41   neither   0   NET +1
  DERIVED                        won   8  13.8%   shown  10  17.2%   both  37   neither   3   NET -2
```

**Pre-registered outcome 2: SEPARATES BUT DOES NOT BEAT THE CONSTANT.** The
declared bar was "favours the won door more often than the shown door, AND net
> the pin's +5". Net +2 clears zero and misses the pin. On the pairs whose
answer actually changed it is **net −2** — the derivation points at the wrong
door more often than the right one, and the misses concentrate in
`satr_fr_rnd` (6) and `satr_de_rnd` (4).

**The ceiling is the important half of this table, and it cuts the other way
from the result.** An answer *exists* that picks the won door on **64 of 86
(74.4%)**. The pairs are separable; the derived answer is simply not the answer
that separates them. That is a fact about the derivation, not about the doors —
and it means wsHA §6's diagnosis stands: the separator is real, statable and
already collected, and reading it off award-derived prose is not how you get it.

## 5. Which answer WOULD have separated them, and the trap in the middle

The oracle says an answer exists on 64 of 86. Which one, if a real founder
stated it:

| option | separates | misleads | net |
|---|--:|--:|--:|
| `feasibility_study` | 33 | 8 | **+25** |
| `industrial_research` | 27 | 8 | +19 |
| `rd_facilities` | 30 | 11 | +19 |
| `ip_protection` | 20 | 10 | +10 |
| `experimental_development` | 20 | 17 | +3 |
| `market_launch` | 3 | 14 | −11 |
| `working_capital` | 3 | 14 | −11 |
| `production_capex` | 5 | 26 | **−21** |

**`production_capex` is the trap, and it is why the derivation goes negative.**
The classifier names it for 120 founders, and it is *reading their prose
correctly* — these companies really are building manufacturing capacity. On this
population that answer points at the wrong door 26 times to 5. The derivation is
not wrong about the founder; the answer is wrong about the doors.

### The signal is carried and then thrown away by the scorer

**On 28 of the 64 separable pairs (43.8%) the derived answer CONTAINED a
separating option — and still scored both doors the same.** `objectiveScorer`
matches on **overlap**: any intersection counts. So an answer naming both
`experimental_development` and `production_capex` overlaps a door registering
either one, and a *richer* answer separates *less*. That is arithmetic, not a
fact about founders.

## 6. A rescoring proposal, priced — and then retired by its own check

**`shortlist.ts` is untouched.** §5's claim is a claim about `objectiveScorer`'s
arithmetic, so it is worth exactly what the counterfactual that prices it is
worth. Two alternative rules, both computable from what the corpus already
holds, scored on the same pairs:

| | overlap (today) | coverage `\|∩\|` | jaccard `\|∩\|/\|∪\|` |
|---|--:|--:|--:|
| derived answer | NET +2 | NET +6 | NET −3 |
| **pin** | NET +5 | **NET +14** | NET +5 |

Coverage reads as a large win. **It is not, and the check that retires it is the
most useful thing in this section.**

```
  Of the 54 pairs COVERAGE+pin separates, it picked the door registering MORE
  purposes on 43 (79.6%), fewer on 2, the same on 9.
  Mean registered purposes: won door 3.12, shown door 2.73.
```

`|reg ∩ answer|` grows with the **size** of the door's registered purpose list,
so a door we happened to document more thoroughly scores higher for a reason
that has nothing to do with the founder — and on this population the won door's
list is the longer one. **That is `leaf_separation_wsAO.md` §4's
documentation-volume prior arriving in a new place**, the one that had to be
nulled out before gate fit could be believed; a ranker acting on it ranks its
own coverage. And the control confirms it: **jaccard, which explicitly penalises
a long list, is worth exactly nothing** — net +5, identical to today. The gain
evaporates the moment volume is controlled for.

**So there is no scoring-rule lead here, and the +14 must not be quoted.** This
section exists to stop the next workstream buying it.

Three further reasons a rule change would not have been safe on this evidence
anyway, kept because they are independent of the above:

- Measured on **86 pairs**, restricted to the pair, model-free.
- `objectiveScorer` normalises with `penalty = OBJECTIVE_MATCH^(-m/k)` over the
  whole candidate group, so changing the match predicate changes `m` and `k` and
  therefore the penalty **for every founder**, not only for these 86.
- `shortlist.ts`'s own comment records that this signal in the row sort cost
  **21 points of exact recall**, because all 421 objective-carrying instruments
  are state-aid schemes and across channels the signal silently becomes a
  channel prior.

## 7. Does it move the funnel — NO. It is inert.

Paired within one process, both arms on the same draw, the same corpus read and
the same embedding. **Every void condition cleared before this table was
written**, in code rather than by eye:

```
population         897 founder(s), draw 13cb71cf3a1d1847  <- the funnel's own, and wsHA's
store              POSTGRES BY DECISION
ranker             all 1656 request(s) on EMBEDDING        <- no lexical fallback
derived-answer arm 446 founder(s) changed, 451 control founder(s) byte-identical
                   across both arms
```

The 451 control founders are the ones whose derived answer equals the pin. They
were served an identical request in both arms, so their traces **must** match;
the run throws if one does not. All 451 matched, so nothing below is a mixture
of the answer and a corpus that moved under it.

| stage | pinned | derived | delta |
|---|---:|---:|---:|
| answer_key | **897** 100.0% | **897** 100.0% | 0 |
| in_corpus | **897** 100.0% | **897** 100.0% | 0 |
| publishable | **828** 92.3% | **828** 92.3% | 0 |
| liveness_confirmed | **828** 92.3% | **828** 92.3% | 0 |
| founder_screen | **806** 89.9% | **806** 89.9% | 0 |
| gates_pass | **774** 86.3% | **774** 86.3% | **0** |
| pool_cut ← | **643** 71.7% | **644** 71.8% | +1 (+0.1 pts) |
| writer_cap ← | **362** 40.4% | **361** 40.2% | −1 (−0.1 pts) |
| published ← | **347** 38.7% | **346** 38.6% | −1 (−0.1 pts) |
| top_6 ← | **321** 35.8% | **320** 35.7% | −1 (−0.1 pts) |
| top_5 ← | **297** 33.1% | **296** 33.0% | −1 (−0.1 pts) |

**Pre-registered outcome 3: DOES NOT PAY** (the bar was ≥ 1.0 point at six rows;
the movement is −0.1). Published as a zero, as pre-registered.

Movement at the founder, both directions, exact two-sided McNemar:

| row | entered | left | net | p |
|---|---:|---:|---:|---:|
| gates_pass | +0 | −0 | 0 | 1.000 |
| pool_cut | +3 | −2 | +1 | 1.000 |
| writer_cap | +0 | −1 | −1 | 1.000 |
| published | +0 | −1 | −1 | 1.000 |
| top_6 | +0 | −1 | −1 | 1.000 |
| top_5 | +0 | −1 | −1 | 1.000 |

**The churn is the finding, not the net.** A net of zero over a churn of forty
would be a signal cancelling itself out. This is a net of zero over a churn of
**five discordant pairs across 446 changed founders**. The derived answer barely
touches the funnel at all, and the mechanism table over the affected 446 only
(pinned 39.9% → derived 39.7% at `published`) says the same thing undiluted.

### Two mechanisms that were expected to fire and did not

- **`gates_pass` moves 0.** `founderIntake` records that **59 hard filters turn
  on this field**, and changing the answer for 446 founders opened and closed
  exactly nothing. Those gates are not on these founders' paths.
- **`objectiveScorer` is mostly neutral by construction.** It returns neutral
  unless the candidate group contains *both* matching and non-matching leaves
  (`if (!m || !k) return neutral`), and the sibling reassignment exits early when
  the preference is flat across the channel. This is wsHA §5's 7.3% —
  `objective` has an opinion on 7.3% of pairs — arriving from the other
  direction, and it explains why a changed answer for half the population moves
  five founders.

So the field's two live paths into the product are, on this population, one
inert and one nearly so. **That bounds what any better answer could buy through
the current wiring** — and it is a separate, larger question from whether the
field separates the doors, which §4's oracle answers yes.

## 8. The honest bound — what these numbers do and do not license

**They bound derived answers on described founders, and nothing else.**

- **The population.** 897 held-out, *described*, one-per-company founders — 27%
  of the recall set. `recallSet.ts` establishes that no work moves that ceiling:
  532 of 5,729 missing descriptions could be rebuilt, and admitting siblings is
  the only relaxation with any yield, and admitting siblings is the leak. A
  founder with no description is not in any figure here.
- **The prose is not the answer.** These descriptions are project descriptions
  recovered from *other* awards. A real founder is asked "what would this
  funding actually pay for?" on the first page and **states** it. The 71.6%
  coverage is a floor on what a real founder can supply, and the 27.3%
  `cannot_tell` is a fact about award prose, **not** a fact about founders.
  Nothing here says a real founder cannot answer this question.
- **Therefore §4's negative does not retire the route.** It says: *reading this
  field off award-derived prose does not pick the right door.* It does not say
  *the field does not pick the right door* — §4's oracle says the opposite, on
  64 of 86. A ceiling measured on today's derived answers bounds today's
  harness, not the product.
- **And §7's zero is about the WIRING, on top of that.** The funnel moved five
  founders because `gates_pass` is inert on this field and `objectiveScorer` is
  neutral by construction on most groups — not because the answer was worthless.
  A *perfect* answer would have to reach the ordering through those same two
  paths. **Nobody has measured what an oracle answer is worth in the funnel**,
  and that is now the cheap, obvious next measurement: this workstream built the
  arm, so it is one free run (`USE_OF_FUNDS=<oracle> npm run stages`) and it
  would separate "the wiring cannot carry this" from "our answer was bad".
- **What it does license, firmly.** The harness's pin is not costing us anything
  on this population. Replacing it with a derived answer is not an improvement,
  is a small regression on the changed pairs, and is inert in the funnel — so
  **no workstream should spend on deriving this field from prose again** without
  a different source. And `production_capex` is a real hazard: a correct reading
  of a founder's own words that points the wrong way 5:1.

---

## Files

- `PREREGISTRATION.md` — committed before the first paid token. What would count
  as the signal paying, what would count as it not paying, and the six
  conditions that void the run.
- `README.md` — this finding.

## Reproduction

- **`website/frontend/scripts/_wshg_useoffunds.ts`** — the derivation. One
  `claude-haiku-4-5` call per founder, leak pre-flight over the whole population
  before the first token, cached by description hash so a re-run is FREE.
  `OUT=/tmp/wshg_uof.json npx tsx scripts/_wshg_useoffunds.ts`
- **`website/frontend/scripts/_wshg_doors.ts`** — §4. Offline, no credentials,
  no model, no database. `UOF=/tmp/wshg_uof.json npx tsx scripts/_wshg_doors.ts`
- **`website/frontend/scripts/measure_funnel.ts`** — §7, via the new
  `USE_OF_FUNDS` arm. `USE_OF_FUNDS=/tmp/wshg_uof.json npm run stages`. Free,
  ~2h40m on a machine running three funnels at once. Writes
  `one_funnel/useoffunds_latest.md` + `.json` and leaves `latest.md` alone,
  because a run carrying a proposed arm is not a point in the series of what the
  product does.
- **`project-mgmt/findings/one_funnel/useoffunds_latest.md`** — §7's full output,
  both arms, every stage.
